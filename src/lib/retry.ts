export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry
  } = options;

  let lastError: Error | unknown;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }

      if (onRetry && error instanceof Error) {
        onRetry(error, attempt);
      }

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  throw lastError;
}

export function isNetworkError(error: Error | unknown): boolean {
  if (!(error instanceof Error) && typeof error !== 'object') {
    return false;
  }
  
  const err = error as Record<string, unknown>;
  const message = error instanceof Error ? error.message : String(err.message || '');
  
  return (
    err.code === 'ETIMEDOUT' ||
    err.code === 'ECONNRESET' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ENETUNREACH' ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch')
  );
}

export function getYouTubeErrorMessage(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const err = error as Record<string, unknown>;
  
  // Check for HTTP status codes
  if (err.statusCode === 410 || message.includes('Status code: 410')) {
    return 'This video is no longer available. It may have been deleted, made private, or removed by the uploader.';
  }
  
  if (err.statusCode === 403 || message.includes('Status code: 403')) {
    return 'Access to this video is forbidden. It may be private, region-blocked, or require authentication.';
  }
  
  if (err.statusCode === 404 || message.includes('Status code: 404')) {
    return 'Video not found. Please check the URL and try again.';
  }
  
  if (isNetworkError(error)) {
    return 'Network error: Unable to connect to YouTube. This could be due to network issues or YouTube being temporarily unavailable. Please try again later.';
  }
  
  if (message.includes('Video unavailable')) {
    return 'This video is unavailable or private.';
  }
  
  if (message.includes('private video')) {
    return 'This is a private video and cannot be processed.';
  }
  
  if (message.includes('age restricted')) {
    return 'This video is age restricted and cannot be processed.';
  }
  
  if (message.includes('Not a YouTube URL')) {
    return 'Please provide a valid YouTube URL.';
  }
  
  return 'Failed to process the video. Please check the URL and try again.';
}