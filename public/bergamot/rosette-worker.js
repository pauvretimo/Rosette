/* eslint-disable */
/* global loadEmscriptenGlueCode, importScripts */

/**
 * Classic (non-module) Worker, spawned by the Discord content script. Loads the vendored
 * Emscripten glue via importScripts (only legal in a classic worker), then exposes a small
 * request/response protocol over postMessage. Ported from firefox-translations'
 * translationWorker.js (constructTranslationService / constructTranslationModelHelper /
 * translate), simplified: no quality-estimation, no outbound translation, and the
 * request/response shape is our own instead of the array-tuple protocol that extension used.
 */

const PIVOT_LANGUAGE = 'en';
const FILE_ALIGNMENT = { model: 256, lex: 64, vocab: 64, srcvocab: 64, trgvocab: 64 };

let WasmEngineModule = null;
let translationService = null;
/** Map of "src-dst" -> WasmEngineModule.TranslationModel */
const translationModels = new Map();

function post(message) {
  postMessage(message);
}

function pairKey(sourceLang, destLang) {
  return `${sourceLang}-${destLang}`;
}

function buildConfigYaml() {
  // DO NOT reformat: Marian's yaml-cpp config parser is whitespace-sensitive here.
  return `
            beam-size: 1
            normalize: 1.0
            word-penalty: 0
            max-length-break: 128
            mini-batch-words: 1024
            workspace: 128
            max-length-factor: 2.0
            skip-cost: true
            cpu-threads: 0
            quiet: true
            quiet-translation: true
            gemm-precision: int8shiftAlphaAll
            alignment: soft
            `;
}

function prepareAlignedMemory(buffer, alignmentSize) {
  const byteArray = new Int8Array(buffer);
  const alignedMemory = new WasmEngineModule.AlignedMemory(byteArray.byteLength, alignmentSize);
  alignedMemory.getByteArrayView().set(byteArray);
  return alignedMemory;
}

function constructTranslationService() {
  if (!translationService) {
    translationService = new WasmEngineModule.BlockingService({ cacheSize: 0 });
  }
}

function loadModel(sourceLang, destLang, files) {
  const key = pairKey(sourceLang, destLang);
  if (translationModels.has(key)) return;

  const alignedModel = prepareAlignedMemory(files.model, FILE_ALIGNMENT.model);
  const alignedShortlist = prepareAlignedMemory(files.lex, FILE_ALIGNMENT.lex);

  const alignedVocabList = new WasmEngineModule.AlignedMemoryList();
  if (files.vocab) {
    alignedVocabList.push_back(prepareAlignedMemory(files.vocab, FILE_ALIGNMENT.vocab));
  } else if (files.srcvocab && files.trgvocab) {
    alignedVocabList.push_back(prepareAlignedMemory(files.srcvocab, FILE_ALIGNMENT.srcvocab));
    alignedVocabList.push_back(prepareAlignedMemory(files.trgvocab, FILE_ALIGNMENT.trgvocab));
  } else {
    throw new Error(`No vocabulary files provided for ${key}`);
  }

  const model = new WasmEngineModule.TranslationModel(
    buildConfigYaml(),
    alignedModel,
    alignedShortlist,
    alignedVocabList,
    null,
  );
  translationModels.set(key, model);
}

function getLoadedModel(sourceLang, destLang) {
  const model = translationModels.get(pairKey(sourceLang, destLang));
  if (!model) throw new Error(`Translation model not loaded: ${pairKey(sourceLang, destLang)}`);
  return model;
}

function translateText(sourceLang, destLang, text) {
  constructTranslationService();

  const vectorSourceText = new WasmEngineModule.VectorString();
  vectorSourceText.push_back(text);
  const vectorResponseOptions = new WasmEngineModule.VectorResponseOptions();
  vectorResponseOptions.push_back({ qualityScores: false, alignment: false, html: false });

  let vectorResponse;
  try {
    if (sourceLang !== PIVOT_LANGUAGE && destLang !== PIVOT_LANGUAGE) {
      const srcToPivot = getLoadedModel(sourceLang, PIVOT_LANGUAGE);
      const pivotToTrg = getLoadedModel(PIVOT_LANGUAGE, destLang);
      vectorResponse = translationService.translateViaPivoting(srcToPivot, pivotToTrg, vectorSourceText, vectorResponseOptions);
    } else {
      const model = getLoadedModel(sourceLang, destLang);
      vectorResponse = translationService.translate(model, vectorSourceText, vectorResponseOptions);
    }
    return vectorResponse.get(0).getTranslatedText();
  } finally {
    vectorSourceText.delete();
    vectorResponseOptions.delete();
    if (vectorResponse) vectorResponse.delete();
  }
}

// The main thread's Worker.onerror only sees a muted "Script error." for uncaught exceptions
// here, since this worker's script origin (moz-extension://) differs from the document that
// spawned it (the Discord page) — a generic cross-origin error-reporting restriction, not
// something specific to this code. Reporting from inside the worker's own context avoids that
// muting entirely, since here the error and the listener are same-origin.
self.addEventListener('error', (event) => {
  post({ type: 'error', message: `Uncaught in worker: ${event.message} (${event.filename}:${event.lineno}:${event.colno})` });
});
self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  post({ type: 'error', message: `Unhandled rejection in worker: ${reason && reason.message ? reason.message : String(reason)}` });
});

onmessage = function handleMessage(event) {
  const message = event.data;
  try {
    switch (message.cmd) {
      case 'init': {
        importScripts(message.engineScriptUrl);
        fetch(message.engineWasmUrl)
          .then((r) => r.arrayBuffer())
          .then((wasmBinary) => {
            WasmEngineModule = loadEmscriptenGlueCode({
              wasmBinary,
              onRuntimeInitialized() {
                post({ type: 'initialized' });
              },
              onAbort() {
                post({ type: 'error', message: 'WASM engine aborted during load' });
              },
            });
          })
          .catch((err) => post({ type: 'error', message: `Failed to load WASM engine: ${err.message}` }));
        break;
      }
      case 'loadModel': {
        loadModel(message.sourceLang, message.destLang, message.files);
        post({ type: 'modelLoaded', requestId: message.requestId, sourceLang: message.sourceLang, destLang: message.destLang });
        break;
      }
      case 'translate': {
        const translatedText = translateText(message.sourceLang, message.destLang, message.text);
        post({ type: 'translated', requestId: message.requestId, translatedText });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    post({ type: 'error', requestId: message.requestId, message: err && err.message ? err.message : String(err) });
  }
};
