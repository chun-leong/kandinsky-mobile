// Storage
export const DB_NAME = 'kandinsky';

// Canvas settings
export const SCALE_MULTIPLIER = 0.8;
export const MIN_CIRCLE_RADIUS = 4;
export const MAX_CIRCLE_RADIUS = 6;
export const LAYOUT_PADDING = 80;
export const FORCE_STRENGTH = 0.3;
export const COLLIDE_PADDING = 20;
export const COLOR_STRING_RED = 'red';
export const COLOR_STRING_WHITE = 'white';

// Timeline settings
export const MIN_PROGRESS = -1;
export const MIN_TIMESTAMP = 0;
export const STEP = 1;
export const PLAY_LOOP_INTERVAL_MS = 100;

// Spectrum settings
export const SPECTRUM_DEFAULT_MODE = false;
export const NUM_GROUPS = 100;
export const MIN_SPECTRUM = 0
export const ACTIVE_BAR_COLOR = '#428cff';
export const PASSIVE_BAR_COLOR = '#2e4366';

// Search settings
export const SEARCH_DEFAULT_MODE = false;
export const SEARCH_DEFAULT_QUERY = '';
export const SEARCH_QUERY_MIN_LENGTH = 3;

// Comment display settings
export const SHOW_COMMENTS_DEFAULT = false;
export const MAX_LIKE_BAR_WIDTH_PX = 10;
export const MIN_LIKE_BAR_WIDTH_PX = 1;

// Analytics settings
export const TERMS_PER_COMMENT = 10;
export const SIMILARITY_THRESHOLD_DEFAULT = 0.5;
export const SHOW_SIMILARITY_DEFAULT = false;
export const MINIMIZE_REFERENCE_COMMENT = true;

// Toast settings
export const TOAST_DURATION_MS = 2000;


// YouTube service
export const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_API_URL_VIDEOS = `${YOUTUBE_API_URL}/videos`;
export const YOUTUBE_API_URL_COMMENTS = `${YOUTUBE_API_URL}/commentThreads`;
export const YOUTUBE_API_URL_REPLIES = `${YOUTUBE_API_URL}/comments`;
export const YOUTUBE_API_KEY = '<YOUR_YOUTUBE_API_KEY>';

export const YOUTUBE_POSTS_STORE_NAME = 'youtube-posts';
export const YOUTUBE_COMMENTS_STORE_NAME = 'youtube-comments';

