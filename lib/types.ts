export type BootLine = {
  text: string;
  color?: string;
  charDelay?: number;
  dotDelay?: number;
  postDelay?: number;
  highlights?: Array<{ word: string; color: string }>;
};

export type CommandResponse = {
  response: string;
  matched: boolean;
};
