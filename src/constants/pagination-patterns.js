/**
 * Pagination-related pattern constants
 * Centralized list of pagination parameter names and patterns
 */

/**
 * URL parameter names that indicate page number pagination
 * Add new parameter names here to extend pagination detection
 */
const PAGE_PARAMETER_NAMES = [
  // Common formats
  'page',
  'p',
  'pg',

  // Descriptive formats
  'pageNum',
  'pageNumber',
  'pagingNumber',      // Paul Weiss format
  'pageNo',
  'currentPage',
  'paged',
  'pn',
  'paging',
  'pageindex',
  'pageIndex',
  'pageno',

  // Numbered formats
  'pagenum',
  'page_number',
  'page_num'
];

/**
 * URL parameter names that indicate offset-based pagination
 */
const OFFSET_PARAMETER_NAMES = [
  'offset',
  'skip',
  'start',
  'from',
  'startIndex',
  'startindex',
  'begin',
  'first'
];

/**
 * URL parameter names that indicate page size/limit
 * These are typically paired with page or offset parameters
 */
const PAGE_SIZE_PARAMETER_NAMES = [
  'pageSize',
  'limit',
  'perPage',
  'count',
  'size',
  'results',
  'show',
  'per_page',
  'page_size'
];

/**
 * CSS selectors for pagination controls
 */
const PAGINATION_CONTROL_SELECTORS = [
  '.pagination',
  '.paging',
  '.page-numbers',
  '[class*="pagination"]',
  '[class*="paging"]',
  'nav[aria-label*="pagination" i]',
  'nav[role="navigation"]',
  'ul.pagination',
  'div.pagination'
];

/**
 * Check if a parameter name is a pagination-related parameter
 * @param {string} paramName - URL parameter name
 * @returns {string|null} - Type of pagination parameter (page/offset/size) or null
 */
function getPaginationParameterType(paramName) {
  const lowerName = paramName.toLowerCase();

  if (PAGE_PARAMETER_NAMES.some(name => name.toLowerCase() === lowerName)) {
    return 'page';
  }

  if (OFFSET_PARAMETER_NAMES.some(name => name.toLowerCase() === lowerName)) {
    return 'offset';
  }

  if (PAGE_SIZE_PARAMETER_NAMES.some(name => name.toLowerCase() === lowerName)) {
    return 'size';
  }

  return null;
}

/**
 * Check if a parameter name is a page number parameter (case-insensitive)
 * @param {string} paramName - URL parameter name
 * @returns {boolean}
 */
function isPageParameter(paramName) {
  return getPaginationParameterType(paramName) === 'page';
}

/**
 * Check if a parameter name is an offset parameter (case-insensitive)
 * @param {string} paramName - URL parameter name
 * @returns {boolean}
 */
function isOffsetParameter(paramName) {
  return getPaginationParameterType(paramName) === 'offset';
}

/**
 * Known domain pagination types
 * Maps domain patterns to their known pagination types
 */
const KNOWN_DOMAIN_PAGINATION = {
  // Infinite scroll sites
  'sullcrom.com': 'infinite-scroll',
  'skadden.com': 'infinite-scroll',
  'weil.com': 'infinite-scroll',

  // Traditional pagination sites
  'paulweiss.com': 'pagination',
  'kirkland.com': 'pagination',
  'linklaters.com': 'pagination',
  'clearygottlieb.com': 'pagination',
  'debevoise.com': 'pagination',
  'cravath.com': 'pagination',

  // Real estate / directory sites with pagination
  'compass.com': 'pagination',
  'zillow.com': 'pagination',
  'realtor.com': 'pagination'
};

/**
 * Detect pagination type from URL
 * Analyzes URL parameters and domain to suggest pagination type
 * @param {string} url - URL to analyze
 * @returns {Object} - { hasPaginationParam, paramName, paramValue, suggestedType, confidence, domainMatch }
 */
function detectPaginationFromUrl(url) {
  const result = {
    hasPaginationParam: false,
    paramName: null,
    paramValue: null,
    suggestedType: null,
    confidence: 'low',
    domainMatch: null
  };

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '');

    // Check for known domain match
    for (const [knownDomain, paginationType] of Object.entries(KNOWN_DOMAIN_PAGINATION)) {
      if (domain === knownDomain || domain.endsWith('.' + knownDomain)) {
        result.domainMatch = knownDomain;
        result.suggestedType = paginationType;
        result.confidence = 'high';
        break;
      }
    }

    // Check URL parameters for pagination indicators
    const params = urlObj.searchParams;
    for (const [key, value] of params.entries()) {
      const paramType = getPaginationParameterType(key);

      if (paramType === 'page' || paramType === 'offset') {
        result.hasPaginationParam = true;
        result.paramName = key;
        result.paramValue = value;

        // URL param suggests pagination (not infinite-scroll)
        if (!result.domainMatch) {
          result.suggestedType = 'pagination';
          result.confidence = 'high';
        }
        break;
      }
    }

    // If no pagination param but domain match suggests infinite-scroll, keep that
    // If no pagination param and no domain match, suggest single-page with low confidence
    if (!result.suggestedType) {
      result.suggestedType = 'single-page';
      result.confidence = 'low';
    }

  } catch (e) {
    // Invalid URL - return defaults
    result.suggestedType = 'single-page';
    result.confidence = 'low';
  }

  return result;
}

module.exports = {
  PAGE_PARAMETER_NAMES,
  OFFSET_PARAMETER_NAMES,
  PAGE_SIZE_PARAMETER_NAMES,
  PAGINATION_CONTROL_SELECTORS,
  KNOWN_DOMAIN_PAGINATION,
  getPaginationParameterType,
  isPageParameter,
  isOffsetParameter,
  detectPaginationFromUrl
};
