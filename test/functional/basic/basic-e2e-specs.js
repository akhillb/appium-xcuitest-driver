import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { GUINEA_PIG_PAGE } from '../web/helpers';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - basics', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async function () {
    await deleteSession();
  });

  describe('status', function () {
    it('should get the server status', async function () {
      let status = await driver.status();
      status.wda.should.exist;
    });

    it('should return status immediately if another operation is in progress', async function () {
      await driver.setImplicitWaitTimeout(10000);
      let findElementPromise = B.resolve(driver.elementById('WrongLocator'));
      let status = await driver.status();
      status.wda.should.exist;
      findElementPromise.isPending().should.be.true;
      try {
        await findElementPromise;
      } catch (err) {
        err.status.should.eql(7);
      }
    });
  });

  describe('session', () => {
    it('should get session details with our caps merged with WDA response', async function () {
      let extraWdaCaps = {
        CFBundleIdentifier: "com.example.apple-samplecode.UICatalog",
        browserName: "UICatalog",
        device: "iphone",
      };
      let expected = Object.assign({}, UICATALOG_CAPS, extraWdaCaps);
      let actual = await driver.sessionCapabilities();
      actual.udid.should.exist;
      // don't really know a priori what the udid should be, so just ensure
      // it's there, and validate the rest
      delete actual.udid;
      delete expected.udid; // for real device tests
      // if we are getting metrics for this run (such as on Travis) there will
      // be events in the result, but we cannot know what they should be
      delete actual.events;
      // sdk version can be a longer version
      actual.sdkVersion.indexOf(UICATALOG_CAPS.platformVersion).should.eql(0);
      delete actual.sdkVersion;
      actual.should.eql(expected);
    });
  });

  describe('source', function () {
    function checkSource (src) {
      // should have full elements
      src.should.include('<AppiumAUT>');
      src.should.include('<XCUIElementTypeApplication');

      // should not have any XCTest errors
      src.should.not.include('AX error');
    }
    describe('plain', function () {
      it('should get the source for the page', async function () {
        let src = await driver.source();
        (typeof src).should.eql('string');
        checkSource(src);
      });
    });
    describe('json parsed', function () {
      it('should get source with useJSONSource', async function () {
        await driver.updateSettings({useJSONSource: true});
        let src = await driver.source();
        checkSource(src);
      });
    });
  });

  describe('deactivate app', function () {
    it('should background the app for the specified time', async function () {
      let before = Date.now();
      await driver.backgroundApp(4);
      (Date.now() - before).should.be.above(4000);
      (await driver.source()).indexOf('<AppiumAUT>').should.not.eql(-1);
    });
  });

  describe('screenshot', function () {
    after(async function () {
      try {
        await driver.setOrientation("PORTRAIT");
      } catch (ign) {}
    });
    it('should get an app screenshot', async function () {
      let screenshot = await driver.takeScreenshot();
      screenshot.should.exist;
      screenshot.should.be.a.string;

      // make sure WDA didn't crash, by using it again
      let els = await driver.elementsByAccessibilityId('Action Sheets');
      els.length.should.eql(1);
    });

    it('should get an app screenshot in landscape mode', async function () {
      let screenshot1 = (await driver.takeScreenshot());
      screenshot1.should.exist;

      try {
        await driver.setOrientation("LANDSCAPE");
      } catch (ign) {}
      // take a little pause while it orients, otherwise you get the screenshot
      // on an angle
      await B.delay(500);

      let screenshot2 = await driver.takeScreenshot();
      screenshot2.should.exist;
      screenshot2.should.not.eql(screenshot1);
    });
  });

  describe('logging', function () {
    describe('types', function () {
      it('should get the list of available logs', async function () {
        let expectedTypes = ['syslog', 'crashlog', 'performance'];
        (await driver.logTypes()).should.eql(expectedTypes);
      });
    });

    describe('retrieval', function () {
      it('should throw an error when an invalid type is given', async function () {
        await driver.log('something-random').should.eventually.be.rejected;
      });
      it('should get system logs', async function () {
        (await driver.log('syslog')).should.be.an.Array;
      });
      it('should get crash logs', async function () {
        (await driver.log('crashlog')).should.be.an.Array;
      });
    });
  });

  describe('orientation', function () {
    beforeEach(async function () {
      await driver.setOrientation('PORTRAIT');
    });
    afterEach(async function () {
      await driver.setOrientation('PORTRAIT');
    });
    it('should get the current orientation', async function () {
      let orientation = await driver.getOrientation();
      ['PORTRAIT', 'LANDSCAPE'].should.include(orientation);
    });
    it('should set the orientation', async function () {
      await driver.setOrientation('LANDSCAPE');

      (await driver.getOrientation()).should.eql('LANDSCAPE');
    });
    it('should be able to interact with an element in LANDSCAPE', async function () {
      await driver.setOrientation('LANDSCAPE');

      let el = await driver.elementByAccessibilityId('Buttons');
      await el.click();

      await driver.elementByAccessibilityId('Button').should.not.be.rejected;

      await driver.back();
    });
  });

  describe('window size', function () {
    it('should be able to get the current window size', async function () {
      let size = await driver.getWindowSize('current');
      size.width.should.be.a.number;
      size.height.should.be.a.number;
    });
    it('should not be able to get random window size', async function () {
      await driver.getWindowSize('something-random').should.be.rejectedWith(/Currently only getting current window size is supported/);
    });
  });

  describe('geo location', function () {
    it('should work on Simulator', async function () {
      if (process.env.CI || process.env.REAL_DEVICE) {
        // skip on Travis, since Appium process should have access to system accessibility
        // in order to run this method successfully
        return this.skip();
      }
      await driver.setGeoLocation('30.0001', '21.0002').should.not.be.rejected;
    });
  });

  describe('shake', function () {
    it('should work on Simulator', async function () {
      if (process.env.CI || process.env.REAL_DEVICE) {
        // skip on Travis, since Appium process should have access to system accessibility
        // in order to run this method successfully
        return this.skip();
      }
      await driver.shakeDevice().should.not.be.rejected;
    });
  });

  describe('lock', function () {
    it('should throw a not-yet-implemented error', async function () {
      await driver.lock().should.be.rejectedWith(/Method has not yet been implemented/);
    });
  });

  describe('contexts', function () {
    before(async function () {
      let el = await driver.elementByAccessibilityId('Web View');
      await driver.execute('mobile: scroll', {element: el, toVisible: true});
      await el.click();
    });
    after(async function () {
      await driver.back();
      await driver.execute('mobile: scroll', {direction: 'up'});
    });

    it('should start a session, navigate to url, get title', async function () {
      let contexts;
      await retryInterval(100, 1000, async function () {
        // on some systems (like Travis) it takes a while to load the webview
        contexts = await driver.contexts();
        contexts.length.should.be.at.least(2);
      });

      await driver.context(contexts[1]);
      await driver.get(GUINEA_PIG_PAGE);

      await retryInterval(100, 1000, async function () {
        let title = await driver.title();
        title.should.equal('I am a page title');
      });

      await driver.context(contexts[0]);
    });
  });
});
