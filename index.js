const spawn = require('cross-spawn');
const request = require('request');
const chromeFinder = require('chrome-launcher/dist/src/chrome-finder');
const chromeUtils = require('chrome-launcher/dist/src/utils');
const parser = require('xml2js');

function getMajorFromVersion(version) {
  return +version.split('.')[0];
}

function getChromeMajorVersion() {
  const promise = new Promise((resolve, reject) => {
    const platform = chromeUtils.getPlatform();
    const installations = chromeFinder[platform]();

    console.log('Platform', platform);
    console.log('Chrome Installations', installations);

    if (installations && installations.length > 0) {
      if (platform === 'win32') {

        const source = spawn('wmic');
        source.stdin.end(
          `datafile where "name='${installations[0].replace(/\\/g, '\\\\')}'" get version /value`
        );

        source.stdout.on('close', () => reject('Unable to get Chrome version from wmic (close)'));
        source.stderr.on('data', () => reject('Unable to get Chrome version from wmic (err)'));
        source.stdout.on('data', (data) => {
          const dataCleaned = data.toString().toLowerCase().trim().split('\r')[0];
          if (dataCleaned.indexOf('version=') > -1) {
            const chromeVersion = dataCleaned.split('=')[1];
            resolve({
              chromeVersion: chromeVersion,
              chromeMajorVersion: getMajorFromVersion(chromeVersion)
            });
          }
        });

      } else {

        const source = spawn(installations[0], ['--version']);
        source.stderr.on('data', () => reject('Unable get Chrome version'));
        source.stdout.on('data', (data) => {
          const chromeVersion = data.toString()
            .trim().substr('Google Chrome '.length).split(' ')[0];
          resolve({
            chromeVersion: chromeVersion,
            chromeMajorVersion: getMajorFromVersion(chromeVersion)
          });
        });

      }

    } else {
      reject('No local installation of Chrome was found.');
    }
  });

  return promise;
}

function getLatestChromeDriverVersion() {
  return new Promise((resolve, reject) => {
    request(
      'https://chromedriver.storage.googleapis.com/',
      (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          parser.parseString(body, (err, results) => {
            if (err) {
              reject(err);
            } else {
              const versionNumbers = results.ListBucketResult.Contents
                .filter((contents) => {
                  return contents.Key[0].indexOf('/notes.txt') >= 0;
                })
                .map((contents) => {
                  return contents.Key[0].split('/')[0];
                })
                .sort((a, b) => {
                  const aMinorVersion = +a.split('.')[1];
                  const bMinorVersion = +b.split('.')[1];

                  if (aMinorVersion < bMinorVersion) {
                    return 1;
                  }

                  if (bMinorVersion < aMinorVersion) {
                    return -1;
                  }

                  return 0;
                });

              resolve(versionNumbers[0]);
            }
          });
        }
      }
    );
  });
}

function getReleaseNotes(latestChromeDriverVersion) {
  return new Promise((resolve, reject) => {
    request(
      'https://chromedriver.storage.googleapis.com/' +
        latestChromeDriverVersion +
        '/notes.txt',
      (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      }
    );
  });
}

function findVersionInReleaseNotes(releaseNotes, chromeMajorVersion) {
  // Look for lines in the release notes that look like this and parse out the mentioned versions:
  // ----------ChromeDriver v2.43 (2018-10-16)----------
  // Supports Chrome v69-71

  const lines = releaseNotes.split('\n');

  for (let i = 0, n = lines.length; i < n; i++) {
    const line = lines[i];

    if (line.indexOf('Supports Chrome v') === 0) {
      const supportedMinMax = line.substr('Supports Chrome v'.length).split('-');

      const minVersion = +supportedMinMax[0];
      const maxVersion = +supportedMinMax[1];

      if (chromeMajorVersion >= minVersion && chromeMajorVersion <= maxVersion) {
        const previousLine = lines[i - 1];

        const chromeDriverVersion = previousLine.substr('----------ChromeDriver v'.length).split(' ')[0];

        return chromeDriverVersion;
      }
    }
  }
}

function getChromeDriverVersion() {
  return new Promise((resolve) => {
    Promise.all(
      [
        getChromeMajorVersion(),
        getLatestChromeDriverVersion()
      ]
    )
      .then((results) => {
        const chromeVersion = results[0];
        const latestChromeDriverVersion = results[1];

        getReleaseNotes(latestChromeDriverVersion)
          .then((releaseNotes) => {
            resolve({
              chromeVersion: chromeVersion.chromeVersion,
              chromeDriverVersion: findVersionInReleaseNotes(
                releaseNotes,
                chromeVersion.chromeMajorVersion
              )
            });
          });
      });
  });
}

module.exports = {
  getChromeDriverVersion: getChromeDriverVersion
};

// USAGE:
// getChromeDriverVersion().then(result => console.log(result));
