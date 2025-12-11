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

module.exports = {
  PAGE_PARAMETER_NAMES,
  OFFSET_PARAMETER_NAMES,
  PAGE_SIZE_PARAMETER_NAMES,
  PAGINATION_CONTROL_SELECTORS,
  getPaginationParameterType,
  isPageParameter,
  isOffsetParameter
};
