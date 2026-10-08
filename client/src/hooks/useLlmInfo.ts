import { useEffect, useState } from 'react';
import { api } from '../api/client';

export interface LlmInfo {
  llm: 'live' | 'demo';
  provider: string;
  model: string | null;
  local: boolean;
}

/** Which language model is answering (from the public health endpoint). */
export function useLlmInfo() {
  const [info, setInfo] = useState<LlmInfo | null>(null);
  useEffect(() => {
    api<LlmInfo>('/health').then(setInfo).catch(() => setInfo(null));
  }, []);
  return info;
}

export function describeLlm(info: LlmInfo | null): string {
  if (!info) return '';
  if (info.llm === 'demo') return 'Demo mode: the tutor shows the matching lesson passages. Connect a model to get written answers.';
  return info.local ? `Answers come from ${info.model}, running on this computer.` : `Answers come from ${info.model}.`;
}
