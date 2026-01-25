/**
 * Selenium WebDriver Configuration and Utilities
 * Provides WebDriver setup and common utilities for testing
 * @version 1.0.0
 */

import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import edge from 'selenium-webdriver/edge.js';

// Test configuration
const TEST_CONFIG = {
  IMPLICIT_WAIT: 10000,          // 10 seconds
  PAGE_LOAD_TIMEOUT: 30000,      // 30 seconds
  SCRIPT_TIMEOUT: 15000,         // 15 seconds
  SCREENSHOT_DIR: './tests/screenshots',
  REPORTS_DIR: './tests/reports'
};

// Browser configurations
const BROWSER_OPTIONS = {
  chrome: {
    headless: false,              // Set to true for CI/CD
    windowSize: '1920,1080',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--allow-running-insecure-content'
    ]
  },
  firefox: {
    headless: false,
    windowSize: '1920,1080'
  },
  edge: {
    headless: false,
    windowSize: '1920,1080'
  }
};

/**
 * Creates a WebDriver instance with specified browser
 * @param {string} browser - Browser name (chrome, firefox, edge)
 * @param {Object} customOptions - Custom browser options
 * @returns {Promise<WebDriver>} WebDriver instance
 */
export async function createWebDriver(browser = 'chrome', customOptions = {}) {
  const options = { ...BROWSER_OPTIONS[browser], ...customOptions };
  let driver;
  
  try {
    switch (browser.toLowerCase()) {
      case 'chrome':
        const chromeOptions = new chrome.Options();
        chromeOptions.addArguments(...options.args);
        chromeOptions.windowSize({ width: 1920, height: 1080 });
        if (options.headless) chromeOptions.headless();
        
        driver = await new Builder()
          .forBrowser('chrome')
          .setChromeOptions(chromeOptions)
          .build();
        break;
        
      case 'firefox':
        const firefoxOptions = new firefox.Options();
        firefoxOptions.windowSize({ width: 1920, height: 1080 });
        if (options.headless) firefoxOptions.headless();
        
        driver = await new Builder()
          .forBrowser('firefox')
          .setFirefoxOptions(firefoxOptions)
          .build();
        break;
        
      case 'edge':
        const edgeOptions = new edge.Options();
        edgeOptions.windowSize({ width: 1920, height: 1080 });
        if (options.headless) edgeOptions.headless();
        
        driver = await new Builder()
          .forBrowser('MicrosoftEdge')
          .setEdgeOptions(edgeOptions)
          .build();
        break;
        
      default:
        throw new Error(`Unsupported browser: ${browser}`);
    }
    
    // Set timeouts
    await driver.manage().setTimeouts({
      implicit: TEST_CONFIG.IMPLICIT_WAIT,
      pageLoad: TEST_CONFIG.PAGE_LOAD_TIMEOUT,
      script: TEST_CONFIG.SCRIPT_TIMEOUT
    });
    
    console.log(`✅ ${browser} WebDriver initialized successfully`);
    return driver;
    
  } catch (error) {
    console.error(`❌ Failed to initialize ${browser} WebDriver:`, error);
    if (driver) await driver.quit();
    throw error;
  }
}

/**
 * WebDriver utility class for common operations
 */
export class WebDriverUtils {
  constructor(driver) {
    this.driver = driver;
  }
  
  /**
   * Safely finds an element with retry logic
   * @param {By} locator - Element locator
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<WebElement>} Found element
   */
  async findElementSafely(locator, timeout = TEST_CONFIG.IMPLICIT_WAIT) {
    try {
      return await this.driver.wait(until.elementLocated(locator), timeout);
    } catch (error) {
      console.warn(`Element not found: ${locator}`, error.message);
      throw new Error(`Element not found within ${timeout}ms: ${locator}`);
    }
  }
  
  /**
   * Types text into an input field with clear and validation
   * @param {By} locator - Input field locator
   * @param {string} text - Text to type
   * @param {boolean} clearFirst - Whether to clear field first
   */
  async typeText(locator, text, clearFirst = true) {
    try {
      const element = await this.findElementSafely(locator);
      
      if (clearFirst) {
        await element.clear();
        await this.driver.sleep(100); // Brief pause for clarity
      }
      
      await element.sendKeys(text);
      
      // Validate text was entered correctly
      const enteredText = await element.getAttribute('value');
      if (enteredText !== text) {
        console.warn(`Text validation failed. Expected: "${text}", Got: "${enteredText}"`);
      }
      
      return element;
    } catch (error) {
      console.error(`Failed to type text "${text}" into element:`, error);
      throw error;
    }
  }
  
  /**
   * Clicks an element with retry logic
   * @param {By} locator - Element locator
   * @param {number} retries - Number of retries
   */
  async clickElement(locator, retries = 3) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        const element = await this.findElementSafely(locator);
        await this.driver.wait(until.elementIsEnabled(element), 5000);
        await element.click();
        return element;
      } catch (error) {
        lastError = error;
        console.warn(`Click attempt ${i + 1} failed:`, error.message);
        if (i < retries - 1) {
          await this.driver.sleep(1000); // Wait before retry
        }
      }
    }
    
    throw new Error(`Failed to click element after ${retries} attempts: ${lastError.message}`);
  }
  
  /**
   * Waits for page to load completely
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForPageLoad(timeout = TEST_CONFIG.PAGE_LOAD_TIMEOUT) {
    try {
      await this.driver.wait(async () => {
        const readyState = await this.driver.executeScript('return document.readyState');
        return readyState === 'complete';
      }, timeout);
      
      // Additional wait for any dynamic content
      await this.driver.sleep(1000);
    } catch (error) {
      console.warn('Page load timeout, continuing anyway:', error.message);
    }
  }
  
  /**
   * Takes a screenshot with timestamp
   * @param {string} testName - Test name for filename
   * @returns {Promise<string>} Screenshot file path
   */
  async takeScreenshot(testName) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${testName}_${timestamp}.png`;
      const screenshot = await this.driver.takeScreenshot();
      
      // In real implementation, you'd save this to file system
      console.log(`📸 Screenshot taken: ${filename}`);
      return filename;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      return null;
    }
  }
  
  /**
   * Executes JavaScript in the browser
   * @param {string} script - JavaScript code
   * @param {...any} args - Script arguments
   * @returns {Promise<any>} Script result
   */
  async executeScript(script, ...args) {
    try {
      return await this.driver.executeScript(script, ...args);
    } catch (error) {
      console.error('Script execution failed:', error);
      throw error;
    }
  }
  
  /**
   * Waits for an AJAX request to complete
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForAjax(timeout = 10000) {
    try {
      await this.driver.wait(async () => {
        const ajaxActive = await this.executeScript(
          'return jQuery ? jQuery.active === 0 : true'
        );
        return ajaxActive;
      }, timeout);
    } catch (error) {
      console.warn('AJAX wait timeout, continuing:', error.message);
    }
  }
  
  /**
   * Scrolls to an element
   * @param {By} locator - Element locator
   */
  async scrollToElement(locator) {
    try {
      const element = await this.findElementSafely(locator);
      await this.executeScript('arguments[0].scrollIntoView(true);', element);
      await this.driver.sleep(500); // Wait for scroll animation
      return element;
    } catch (error) {
      console.error('Failed to scroll to element:', error);
      throw error;
    }
  }
  
  /**
   * Gets element text with null safety
   * @param {By} locator - Element locator
   * @returns {Promise<string>} Element text
   */
  async getElementText(locator) {
    try {
      const element = await this.findElementSafely(locator);
      return await element.getText();
    } catch (error) {
      console.warn('Failed to get element text:', error);
      return '';
    }
  }
  
  /**
   * Checks if element exists without throwing error
   * @param {By} locator - Element locator
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} True if element exists
   */
  async elementExists(locator, timeout = 1000) {
    try {
      await this.driver.manage().setTimeouts({ implicit: timeout });
      await this.driver.findElement(locator);
      await this.driver.manage().setTimeouts({ implicit: TEST_CONFIG.IMPLICIT_WAIT });
      return true;
    } catch (error) {
      await this.driver.manage().setTimeouts({ implicit: TEST_CONFIG.IMPLICIT_WAIT });
      return false;
    }
  }
  
  /**
   * Closes the WebDriver instance
   */
  async close() {
    try {
      await this.driver.quit();
      console.log('✅ WebDriver closed successfully');
    } catch (error) {
      console.error('❌ Error closing WebDriver:', error);
    }
  }
}

/**
 * Test results collector
 */
export class TestResults {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }
  
  /**
   * Adds a test result
   * @param {string} testName - Test name
   * @param {boolean} passed - Test passed status
   * @param {string} message - Test message
   * @param {number} duration - Test duration in milliseconds
   * @param {Object} data - Additional test data
   */
  addResult(testName, passed, message, duration, data = {}) {
    this.results.push({
      testName,
      passed,
      message,
      duration,
      data,
      timestamp: new Date().toISOString()
    });
    
    console.log(
      `${passed ? '✅' : '❌'} ${testName} (${duration}ms): ${message}`
    );
  }
  
  /**
   * Gets test summary
   * @returns {Object} Test summary
   */
  getSummary() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = Date.now() - this.startTime;
    
    return {
      totalTests,
      passedTests,
      failedTests,
      successRate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0,
      totalDuration,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date().toISOString()
    };
  }
  
  /**
   * Prints formatted test report
   */
  printReport() {
    const summary = this.getSummary();
    
    console.log('\\n' + '='.repeat(60));
    console.log('📊 TEST REPORT');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`✅ Passed: ${summary.passedTests}`);
    console.log(`❌ Failed: ${summary.failedTests}`);
    console.log(`📈 Success Rate: ${summary.successRate}%`);
    console.log(`⏱️ Total Duration: ${summary.totalDuration}ms`);
    console.log('='.repeat(60));
    
    // Print failed tests details
    const failedTests = this.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('\\n❌ FAILED TESTS:');
      failedTests.forEach(test => {
        console.log(`  • ${test.testName}: ${test.message}`);
      });
    }
    
    console.log('\\n✅ Test execution completed!\\n');
  }
}

export { By, until, Key, TEST_CONFIG };