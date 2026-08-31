export interface ExtractedEntityCandidate {
  label: string;
  text: string;
  textStart: number;
  textEnd: number;
  confidence: number;
  modelName: string;
}
