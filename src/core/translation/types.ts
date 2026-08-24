export interface TranslateResult {
  translatedText: string;
  detectedLang: string;
  fromCache: boolean;
}

export interface ExtractedMessage {
  id: string;
  groupId: string;
  subgroupId?: string;
  text: string;
  element: Element;
}
