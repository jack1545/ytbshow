export function getYouTubeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for specific YouTube error patterns
    if (error.message.includes('Sign in to confirm you\'re not a bot')) {
      return 'YouTube bot detection triggered. Please try again later.';
    }
    if (error.message.includes('Video unavailable')) {
      return 'This video is not available or has been removed.';
    }
    if (error.message.includes('Private video')) {
      return 'This video is private and cannot be accessed.';
    }
    if (error.message.includes('Age-restricted')) {
      return 'This video is age-restricted and cannot be processed.';
    }
    if (error.message.includes('No streaming data')) {
      return 'No streaming data available for this video.';
    }
    if (error.message.includes('No formats found')) {
      return 'No suitable video formats found for processing.';
    }
    
    return error.message;
  }
  
  return 'An unknown error occurred while processing the YouTube video.';
}