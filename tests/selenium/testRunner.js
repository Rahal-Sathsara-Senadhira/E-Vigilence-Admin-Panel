/**
 * Test Runner for Police Stations Selenium Tests
 * Comprehensive test execution with reporting and configuration
 * @version 1.0.0
 */

import { 
  PoliceStationsSeleniumTests, 
  runCrossBrowserTests 
} from './policeStationsTests.js';

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Test configuration and runner
 */
class TestRunner {
  constructor() {
    this.testResults = [];
    this.config = {
      browsers: ['chrome'], // Default to chrome only
      headless: true,
      outputDir: './test-results',
      generateReport: true,
      runCrossBrowser: false
    };
  }
  
  /**
   * Load configuration from file or environment
   */
  async loadConfiguration() {
    try {
      // Check for config file
      const configPath = path.join(process.cwd(), 'tests', 'config', 'selenium.config.json');
      
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const fileConfig = JSON.parse(configData);
        this.config = { ...this.config, ...fileConfig };
        console.log('📋 Configuration loaded from file');
      } catch (fileError) {
        console.log('📋 Using default configuration (no config file found)');
      }
      
      // Override with environment variables
      if (process.env.TEST_BROWSER) {
        this.config.browsers = process.env.TEST_BROWSER.split(',');
      }
      
      if (process.env.TEST_HEADLESS !== undefined) {
        this.config.headless = process.env.TEST_HEADLESS.toLowerCase() === 'true';
      }
      
      if (process.env.CROSS_BROWSER_TEST === 'true') {
        this.config.runCrossBrowser = true;
      }
      
    } catch (error) {
      console.warn('⚠️ Configuration loading failed, using defaults:', error.message);
    }
  }
  
  /**
   * Create output directory for test results
   */
  async createOutputDirectory() {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
      console.log(`📁 Output directory created: ${this.config.outputDir}`);
    } catch (error) {
      console.warn('⚠️ Failed to create output directory:', error.message);
    }
  }
  
  /**
   * Run single browser test
   */
  async runSingleBrowserTest(browser, headless = true) {
    console.log(`\\n🚀 Running tests with ${browser}...`);
    
    const startTime = Date.now();
    const tester = new PoliceStationsSeleniumTests(browser, headless);
    
    try {
      const results = await tester.runAllTests();
      const duration = Date.now() - startTime;
      
      return {
        browser,
        success: true,
        results,
        duration,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        browser,
        success: false,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Generate HTML test report
   */
  async generateHtmlReport(allResults) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Police Stations Selenium Test Report</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
            text-align: center; 
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid #4CAF50;
        }
        .header h1 { 
            color: #333; 
            margin: 0;
            font-size: 2.5em;
        }
        .header p { 
            color: #666; 
            margin: 10px 0;
            font-size: 1.1em;
        }
        .summary { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .summary-card { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .summary-card h3 { 
            margin: 0 0 10px 0; 
            font-size: 2em;
        }
        .summary-card p { 
            margin: 0; 
            font-size: 1.1em;
            opacity: 0.9;
        }
        .browser-results { 
            margin-bottom: 40px;
        }
        .browser-section { 
            margin-bottom: 30px;
            border: 2px solid #ddd;
            border-radius: 10px;
            overflow: hidden;
        }
        .browser-header { 
            background: #4CAF50;
            color: white;
            padding: 15px 25px;
            font-weight: bold;
            font-size: 1.2em;
        }
        .browser-header.failed { 
            background: #f44336;
        }
        .test-results { 
            padding: 0;
        }
        .test-item { 
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 25px;
            border-bottom: 1px solid #eee;
            background: white;
        }
        .test-item:hover { 
            background: #f9f9f9;
        }
        .test-item:last-child { 
            border-bottom: none;
        }
        .test-name { 
            font-weight: 500;
            color: #333;
        }
        .test-status { 
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: bold;
        }
        .test-status.pass { 
            background: #4CAF50;
            color: white;
        }
        .test-status.fail { 
            background: #f44336;
            color: white;
        }
        .test-details { 
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
        }
        .duration { 
            color: #888;
            font-size: 0.9em;
        }
        .error-message { 
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-left: 4px solid #f44336;
            margin: 10px 0;
            border-radius: 0 5px 5px 0;
        }
        .footer { 
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚔 Police Stations Selenium Test Report</h1>
            <p>Comprehensive testing with random Sri Lankan locations</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="summary-card">
                <h3>${allResults.length}</h3>
                <p>Browser(s) Tested</p>
            </div>
            <div class="summary-card">
                <h3>${allResults.reduce((sum, r) => sum + (r.results?.totalTests || 0), 0)}</h3>
                <p>Total Tests</p>
            </div>
            <div class="summary-card">
                <h3>${allResults.reduce((sum, r) => sum + (r.results?.passedTests || 0), 0)}</h3>
                <p>Tests Passed</p>
            </div>
            <div class="summary-card">
                <h3>${(allResults.reduce((sum, r) => sum + (r.results?.successRate || 0), 0) / allResults.length).toFixed(1)}%</h3>
                <p>Success Rate</p>
            </div>
        </div>
        
        <div class="browser-results">
            ${allResults.map(result => `
                <div class="browser-section">
                    <div class="browser-header ${result.success ? '' : 'failed'}">
                        ${result.browser.toUpperCase()} - ${result.success ? 'SUCCESS' : 'FAILED'} 
                        (${(result.duration / 1000).toFixed(1)}s)
                    </div>
                    
                    ${result.success ? `
                        <div class="test-results">
                            ${result.results.results.map(test => `
                                <div class="test-item">
                                    <div>
                                        <div class="test-name">${test.name}</div>
                                        <div class="test-details">${test.message}</div>
                                    </div>
                                    <div>
                                        <span class="test-status ${test.passed ? 'pass' : 'fail'}">
                                            ${test.passed ? 'PASS' : 'FAIL'}
                                        </span>
                                        <div class="duration">${test.duration}ms</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="error-message">
                            <strong>Test execution failed:</strong> ${result.error}
                        </div>
                    `}
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            <p>🧪 Generated by Police Stations Selenium Test Suite v1.0.0</p>
        </div>
    </div>
</body>
</html>`;

    const reportPath = path.join(this.config.outputDir, 'test-report.html');
    await fs.writeFile(reportPath, html, 'utf8');
    console.log(`📊 HTML report generated: ${reportPath}`);
  }
  
  /**
   * Generate JSON test report
   */
  async generateJsonReport(allResults) {
    const jsonReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalBrowsers: allResults.length,
        successfulBrowsers: allResults.filter(r => r.success).length,
        totalTests: allResults.reduce((sum, r) => sum + (r.results?.totalTests || 0), 0),
        passedTests: allResults.reduce((sum, r) => sum + (r.results?.passedTests || 0), 0),
        failedTests: allResults.reduce((sum, r) => sum + (r.results?.failedTests || 0), 0),
        averageSuccessRate: (allResults.reduce((sum, r) => sum + (r.results?.successRate || 0), 0) / allResults.length).toFixed(1),
        totalDuration: allResults.reduce((sum, r) => sum + r.duration, 0)
      },
      results: allResults,
      configuration: this.config
    };
    
    const reportPath = path.join(this.config.outputDir, 'test-results.json');
    await fs.writeFile(reportPath, JSON.stringify(jsonReport, null, 2), 'utf8');
    console.log(`📋 JSON report generated: ${reportPath}`);
  }
  
  /**
   * Main test execution function
   */
  async run() {
    console.log('🧪 Police Stations Selenium Test Runner Starting...');
    console.log('='.repeat(60));
    
    try {
      // Load configuration
      await this.loadConfiguration();
      console.log('📋 Configuration:', JSON.stringify(this.config, null, 2));
      
      // Create output directory
      await this.createOutputDirectory();
      
      let allResults = [];
      
      if (this.config.runCrossBrowser) {
        // Run cross-browser tests
        console.log('\\n🌐 Running cross-browser tests...');
        const browserResults = await runCrossBrowserTests();
        
        // Convert format
        allResults = Object.entries(browserResults).map(([browser, results]) => ({
          browser,
          success: !results.error,
          results: results.error ? null : results,
          error: results.error,
          duration: 0, // Cross-browser function doesn't track individual durations
          timestamp: new Date().toISOString()
        }));
        
      } else {
        // Run single browser tests
        for (const browser of this.config.browsers) {
          const result = await this.runSingleBrowserTest(browser, this.config.headless);
          allResults.push(result);
        }
      }
      
      // Generate reports
      if (this.config.generateReport) {
        await this.generateHtmlReport(allResults);
        await this.generateJsonReport(allResults);
      }
      
      // Print final summary
      this.printFinalSummary(allResults);
      
      return allResults;
      
    } catch (error) {
      console.error('❌ Test runner failed:', error);
      throw error;
    }
  }
  
  /**
   * Print final test summary
   */
  printFinalSummary(allResults) {
    console.log('\\n' + '='.repeat(60));
    console.log('🏁 FINAL TEST SUMMARY');
    console.log('='.repeat(60));
    
    const totalTests = allResults.reduce((sum, r) => sum + (r.results?.totalTests || 0), 0);
    const passedTests = allResults.reduce((sum, r) => sum + (r.results?.passedTests || 0), 0);
    const avgSuccessRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(`📊 Browsers Tested: ${allResults.length}`);
    console.log(`🧪 Total Tests: ${totalTests}`);
    console.log(`✅ Tests Passed: ${passedTests}`);
    console.log(`❌ Tests Failed: ${totalTests - passedTests}`);
    console.log(`📈 Success Rate: ${avgSuccessRate}%`);
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    
    console.log('\\n🌐 Browser Results:');
    allResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const rate = result.results?.successRate || 0;
      console.log(`   ${status} ${result.browser.toUpperCase()}: ${rate}% success`);
    });
    
    console.log('='.repeat(60));
    
    if (this.config.generateReport) {
      console.log('📊 Detailed reports saved in:', this.config.outputDir);
    }
  }
}

// Export test runner
export { TestRunner };

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestRunner();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--cross-browser')) {
    runner.config.runCrossBrowser = true;
  }
  if (args.includes('--headful')) {
    runner.config.headless = false;
  }
  if (args.includes('--chrome-only')) {
    runner.config.browsers = ['chrome'];
  }
  if (args.includes('--all-browsers')) {
    runner.config.browsers = ['chrome', 'firefox', 'edge'];
  }
  
  // Run tests
  runner.run()
    .then(results => {
      const allSuccessful = results.every(r => r.success && (r.results?.successRate || 0) === 100);
      process.exit(allSuccessful ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test runner crashed:', error);
      process.exit(2);
    });
}