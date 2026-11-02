// Bound the whole operation, including response-body reads and provider retries.
export async function withRequestDeadline(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => { timer = setTimeout(() => {
        const error = new Error('AI request timed out');
        error.code = 'AI_TIMEOUT';
        controller.abort(error);
        reject(error);
      }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

export function labFailure(error, stage) {
  const timeout = error?.code === 'AI_TIMEOUT' || error?.status === 504 || error?.cause?.status === 504 ||
    /timed?\s*out|timeout|deadline|abort/i.test(`${error?.message || ''} ${error?.cause?.message || ''}`);
  const invalid = /invalid|incomplete|missing|empty|paragraph|narration|json|reply too long/i.test(String(error?.message || ''));
  return { stage, code: timeout ? 'timeout' : invalid ? 'invalid_response' : 'unavailable', at: new Date().toISOString() };
}
