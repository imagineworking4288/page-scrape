/**
 * Screenshot Extractor v2.3
 *
 * Uses Tesseract.js for OCR-based text extraction from page regions.
 * Takes screenshots of specific coordinates and extracts text using OCR.
 */

const Tesseract = require('tesseract.js');
const path = require('path');

class ScreenshotExtractor {
  constructor(page) {
    this.page = page;
    this.worker = null;
    this.initialized = false;
  }

  /**
   * Initialize Tesseract worker
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.worker = await Tesseract.createWorker('eng');
      this.initialized = true;
      console.log('[ScreenshotExtractor] Tesseract worker initialized');
    } catch (error) {
      console.error('[ScreenshotExtractor] Failed to initialize Tesseract:', error.message);
      throw error;
    }
  }

  /**
   * Cleanup Tesseract worker
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      console.log('[ScreenshotExtractor] Tesseract worker terminated');
    }
  }

  /**
   * Extract text from a region within a card element
   * @param {Object} cardElement - The card element handle from Puppeteer
   * @param {Object} fieldCoords - Relative coordinates within the card { x, y, width, height }
   * @returns {Object} - { value, confidence, metadata }
   */
  async extractFromRegion(cardElement, fieldCoords) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get card's absolute position on page
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) {
        throw new Error('Card element has no bounding box');
      }

      // Calculate absolute position of the field
      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x,
        y: cardBox.y + fieldCoords.y,
        width: fieldCoords.width,
        height: fieldCoords.height
      };

      // Add small padding to capture edge text
      const padding = 2;
      const captureCoords = {
        x: Math.max(0, absoluteCoords.x - padding),
        y: Math.max(0, absoluteCoords.y - padding),
        width: absoluteCoords.width + (padding * 2),
        height: absoluteCoords.height + (padding * 2)
      };

      // Capture screenshot of the region
      const screenshot = await this.captureRegionScreenshot(captureCoords);

      // Run OCR on the screenshot
      const ocrResult = await this.runOCR(screenshot);

      // Clean and process the text
      const cleanedText = this.cleanText(ocrResult.text);
      const confidence = this.calculateConfidence(ocrResult, cleanedText);

      return {
        value: cleanedText,
        confidence: confidence,
        metadata: {
          method: 'screenshot-ocr',
          ocrConfidence: ocrResult.confidence,
          rawText: ocrResult.text,
          absoluteCoords: absoluteCoords,
          captureCoords: captureCoords
        }
      };
    } catch (error) {
      console.error('[ScreenshotExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'screenshot-ocr',
          error: error.message
        }
      };
    }
  }

  /**
   * Capture a screenshot of a specific region
   * @param {Object} coords - { x, y, width, height }
   * @returns {Buffer} - Screenshot buffer
   */
  async captureRegionScreenshot(coords) {
    // Ensure minimum dimensions
    const clip = {
      x: Math.round(coords.x),
      y: Math.round(coords.y),
      width: Math.max(10, Math.round(coords.width)),
      height: Math.max(10, Math.round(coords.height))
    };

    const screenshot = await this.page.screenshot({
      clip: clip,
      type: 'png',
      encoding: 'binary'
    });

    return screenshot;
  }

  /**
   * Run OCR on an image buffer
   * @param {Buffer} imageBuffer - PNG image buffer
   * @returns {Object} - { text, confidence }
   */
  async runOCR(imageBuffer) {
    try {
      const result = await this.worker.recognize(imageBuffer);

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        words: result.data.words || []
      };
    } catch (error) {
      console.error('[ScreenshotExtractor] OCR failed:', error.message);
      return {
        text: '',
        confidence: 0,
        words: []
      };
    }
  }

  /**
   * Clean extracted text
   * @param {string} text - Raw OCR text
   * @returns {string} - Cleaned text
   */
  cleanText(text) {
    if (!text) return '';

    return text
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove common OCR artifacts
      .replace(/[|]/g, '')
      // Trim
      .trim();
  }

  /**
   * Calculate confidence score for extraction
   * @param {Object} ocrResult - Raw OCR result
   * @param {string} cleanedText - Cleaned text
   * @returns {number} - Confidence 0-100
   */
  calculateConfidence(ocrResult, cleanedText) {
    let confidence = ocrResult.confidence || 0;

    // Penalize empty results
    if (!cleanedText || cleanedText.length === 0) {
      return 0;
    }

    // Penalize very short results (likely noise)
    if (cleanedText.length < 2) {
      confidence *= 0.3;
    }

    // Penalize results with many special characters (OCR artifacts)
    const specialCharRatio = (cleanedText.match(/[^a-zA-Z0-9\s@.,\-()]/g) || []).length / cleanedText.length;
    if (specialCharRatio > 0.2) {
      confidence *= 0.7;
    }

    // Boost for results that look like names (2-4 words, capitalized)
    const words = cleanedText.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const allCapitalized = words.every(w => /^[A-Z]/.test(w));
      if (allCapitalized) {
        confidence = Math.min(100, confidence * 1.1);
      }
    }

    return Math.round(Math.max(0, Math.min(100, confidence)));
  }

  /**
   * Extract text from multiple regions (batch processing)
   * @param {Object} cardElement - Card element handle
   * @param {Array} regions - Array of { fieldName, coords }
   * @returns {Object} - { fieldName: result }
   */
  async extractMultipleRegions(cardElement, regions) {
    const results = {};

    for (const region of regions) {
      results[region.fieldName] = await this.extractFromRegion(
        cardElement,
        region.coords
      );
    }

    return results;
  }

  /**
   * Test OCR on a full card screenshot (for debugging)
   * @param {Object} cardElement - Card element handle
   * @returns {Object} - Full OCR result
   */
  async testFullCardOCR(cardElement) {
    if (!this.initialized) {
      await this.initialize();
    }

    const cardBox = await cardElement.boundingBox();
    if (!cardBox) {
      throw new Error('Card element has no bounding box');
    }

    const screenshot = await this.captureRegionScreenshot(cardBox);
    const ocrResult = await this.runOCR(screenshot);

    return {
      text: this.cleanText(ocrResult.text),
      confidence: ocrResult.confidence,
      rawText: ocrResult.text,
      dimensions: cardBox
    };
  }
}

module.exports = ScreenshotExtractor;
