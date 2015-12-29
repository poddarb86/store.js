var _ = require('lodash')
var api = require('./saucelabs-api')

module.exports = {
	setAuth: api.setAuth,
	getAllSupportedPlatforms: getAllSupportedPlatforms,
	runTest: runTest,
	platformSets: require('./saucelabs-platformSets')
}

function getAllSupportedPlatforms(callback) {
	api.get('info/platforms/webdriver', function(platformsInfo) {
		var platforms = _.map(platformsInfo, function(info) {
			return [info['os'], info['api_name'], info['short_version']]
		})
		callback(filterUniquePlatforms(platforms))
	})
}

function runTests(url, platforms, callback) {
	var params = { url:url, platforms:platforms, framework:'custom', recordVideo:false, recordScreenshots:false, recordLogs:false }
	api.post('js-tests', params, callback)
}

function getPlatformId(platform) {
	return platform.join('-')
		.replace('OS X', 'Mac')
		.replace('Windows XP', 'Windows 2003')
		.replace('Windows 7', 'Windows 2008')
		.replace('Windows 8', 'Windows 2012')
}

function filterUniquePlatforms(platforms) {
	var seen = {}
	return _.filter(platforms, function(platform) {
		var platformId = getPlatformId(platform)
		if (seen[platformId]) { return false }
		seen[platformId] = true
		return true
	})
}

function runTest(url, callback, platformSet1, platformSet2, platformSetN) {
	var platformSets = Array.prototype.slice.call(arguments, 2)
	getPlatformsArg(platformSets, function(platforms) {
		var runTestsRes
		runTests(url, platforms, function(res) {
			runTestsRes = res
			loopCheckStatus()
		})
		function loopCheckStatus() {
			getTestsStatus(runTestsRes, function(res) {
				if (res.completed) {
					console.log("Test suite completed")
					var err = checkTestResults(res)
					callback(err)
				} else {
					_.each(res['js tests'], function(test) {
						console.log(getTestStatus(test), test.id, test.status, test.platform)
					})
					console.log("CHECK AGAIN IN 5 SECONDS")
					setTimeout(loopCheckStatus, 5000)
				}
			})
		}
	})
}

function getPlatformsArg(platformSets, callback) {
	getAllSupportedPlatforms(function(supportedPlatforms) {
		var allSupportedPlatforms = {}
		_.each(supportedPlatforms, function(platform) {
			allSupportedPlatforms[getPlatformId(platform)] = true
		})
		
		var platforms = _.flatten(_.flatten(_.flatten(
			_.map(platformSets, function(platformSet) {
				return _.map(platformSet, function(browserSpecs, osName) {
					return _.map(browserSpecs, function(browserVersions, browserName) {
						return _.map(browserVersions, function(browserVersion) {
							return [osName, browserName, browserVersion]
						})
					})
				})
			})
		)))
		
		_.each(platforms, function(platform) {
			if (!platform[2]) { return } // Don't sanity-check CURRENT_VERSION
			var platformId = getPlatformId(platform)
			if (!allSupportedPlatforms[platformId]) {
				throw new Error('Unsupported platform: '+platform.join(', ')+' ('+platformId+')')
			}
		})
		
		callback(filterUniquePlatforms(platforms))
	})
}

function getTestsStatus(runTestsRes, callback) {
	api.post('js-tests/status', { 'js tests':runTestsRes['js tests'] }, function(res) {
		callback(res)
	})
}

var PENDING = 'PENDING'
var FAILED  = 'FAILED '
var PASSED  = 'PASSED '
function getTestStatus(test) {
	if (test.status == 'test error') {
		return FAILED
	} else if (test.result) {
		return (test.result.failed ? FAILED : PASSED)
	} else {
		return PENDING
	}
}

function checkTestResults(res) {
	var failed = 0
	_.each(res['js tests'], function(test) {
		console.log(getTestStatus(test), test.id, test.status, test.platform, test.url)
		if (getTestStatus(test) == FAILED) {
			failed += 1
			console.log('Result:', test.result)
		}
	})
	if (failed) {
		console.log(failed, 'TESTS FAILED!')
		return new Error(failed+' tests failed')
	} else {
		console.log('ALL TEST PASSED!')
	}
}