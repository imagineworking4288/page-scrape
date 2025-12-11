/**
 * Pagination Pattern Detection Priority Tests
 * Tests the new priority logic: URL params > Visual controls > Scroll behavior
 */

const { getPaginationParameterType } = require('../src/constants/pagination-patterns');

console.log('='.repeat(60));
console.log('PAGINATION URL PARAMETER DETECTION TESTS');
console.log('='.repeat(60));

// Test URLs
const testUrls = [
  { url: 'https://example.com?page=1', expected: { found: true, paramName: 'page', type: 'parameter' } },
  { url: 'https://example.com?p=2', expected: { found: true, paramName: 'p', type: 'parameter' } },
  { url: 'https://example.com?pageNum=3', expected: { found: true, paramName: 'pageNum', type: 'parameter' } },
  { url: 'https://example.com?pagingNumber=4', expected: { found: true, paramName: 'pagingNumber', type: 'parameter' } },
  { url: 'https://example.com?pageNumber=5', expected: { found: true, paramName: 'pageNumber', type: 'parameter' } },
  { url: 'https://example.com?offset=20', expected: { found: true, paramName: 'offset', type: 'offset' } },
  { url: 'https://example.com?skip=40', expected: { found: true, paramName: 'skip', type: 'offset' } },
  { url: 'https://example.com/directory', expected: { found: false } },
  { url: 'https://kirkland.com/lawyers?office=123&page=1', expected: { found: true, paramName: 'page', type: 'parameter' } },
  { url: 'https://paulweiss.com/professionals?pageId=1492&pageSize=48&pagingNumber=2', expected: { found: true, paramName: 'pagingNumber', type: 'parameter' } }
];

function detectUrlParams(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    for (const [paramName, paramValue] of params.entries()) {
      const paramType = getPaginationParameterType(paramName);

      if (paramType === 'page' && /^\d+$/.test(paramValue)) {
        return { found: true, type: 'parameter', paramName, value: parseInt(paramValue) };
      }

      if (paramType === 'offset' && /^\d+$/.test(paramValue)) {
        return { found: true, type: 'offset', paramName, value: parseInt(paramValue) };
      }
    }

    return { found: false };
  } catch (error) {
    return { found: false, error: error.message };
  }
}

let passed = 0;
let failed = 0;

console.log('\n[TEST 1] URL Parameter Detection\n');

for (const test of testUrls) {
  const result = detectUrlParams(test.url);
  const paramMatch = test.expected.paramName ? result.paramName === test.expected.paramName : true;
  const typeMatch = test.expected.type ? result.type === test.expected.type : true;
  const ok = result.found === test.expected.found && paramMatch && typeMatch;

  if (ok) {
    console.log('  ✓ PASS:', test.url.substring(0, 60));
    passed++;
  } else {
    console.log('  ✗ FAIL:', test.url.substring(0, 60));
    console.log('    Expected:', JSON.stringify(test.expected));
    console.log('    Got:', JSON.stringify(result));
    failed++;
  }
}

// Test priority: pageId should NOT be detected as pagination (it's not in PAGE_PARAMETER_NAMES)
console.log('\n[TEST 2] Non-Pagination Parameter Check\n');

const nonPaginationUrls = [
  { url: 'https://example.com?pageId=1492', expected: { found: false } },
  { url: 'https://example.com?id=123', expected: { found: false } },
  { url: 'https://example.com?sort=name&filter=active', expected: { found: false } }
];

for (const test of nonPaginationUrls) {
  const result = detectUrlParams(test.url);
  const ok = result.found === test.expected.found;

  if (ok) {
    console.log('  ✓ PASS: Correctly ignored non-pagination param:', test.url.substring(0, 50));
    passed++;
  } else {
    console.log('  ✗ FAIL: Incorrectly detected:', test.url.substring(0, 50));
    console.log('    Got:', JSON.stringify(result));
    failed++;
  }
}

// Test case insensitivity
console.log('\n[TEST 3] Case Insensitivity\n');

const caseTests = [
  { url: 'https://example.com?PAGE=1', paramName: 'PAGE' },
  { url: 'https://example.com?Page=1', paramName: 'Page' },
  { url: 'https://example.com?OFFSET=20', paramName: 'OFFSET' }
];

for (const test of caseTests) {
  const result = detectUrlParams(test.url);
  const ok = result.found && result.paramName === test.paramName;

  if (ok) {
    console.log('  ✓ PASS: Case handled correctly:', test.paramName);
    passed++;
  } else {
    console.log('  ✗ FAIL: Case not handled:', test.paramName);
    console.log('    Got:', JSON.stringify(result));
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`  Total: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log('\n  ✓ All tests passed!');
} else {
  console.log('\n  ✗ Some tests failed');
}

console.log('='.repeat(60) + '\n');

process.exit(failed > 0 ? 1 : 0);
