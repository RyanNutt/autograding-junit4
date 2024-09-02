const { execSync, spawnSync, spawn } = require('child_process')
const core = require('@actions/core')
const Table = require('cli-table3')

const env = {
    PATH: process.env.PATH,
    FORCE_COLOR: 'true',
    DOTNET_CLI_HOME: '/tmp',
    DOTNET_NOLOGO: 'true',
    HOME: process.env.HOME,
}

function getInputs() {
    const testName = core.getInput('test-name', { required: true })
    const testClasses = core.getInput('test-class', { required: true }).split('\s*,\s*  ')
    const setupCommand = core.getInput('setup-command')
    const timeout = parseFloat(core.getInput('timeout') || 5) * 60_000 // Minutes to milliseconds
    const maxScore = parseFloat(core.getInput('max-score') || 0)
    const libFolder = core.getInput('lib-folder') || 'lib'
    const partialCredit = core.getInput('partial-credit') === 'true'

    const buildCommand = 'javac -cp "' + libFolder + '/*" -d . *.java'
    const runCommand = 'java -cp "' + libFolder + '/*:." org.junit.runner.JUnitCore ' + testClasses.join(' ')

    return { testName, testClasses, setupCommand, timeout, maxScore, libFolder, partialCredit, buildCommand, runCommand }
}


/**
 * Execute the setup command, if needed.
 * 
 * Output is ignored, just care if it runs successfully
 */
function setup(inputs) {
    if (inputs.setupCommand) {
        let rs = spawnSync(inputs.setupCommand, {
            timeout: inputs.timeout,
            stdio: 'ignore',
            env,
        })

        if (rs.error) {
            const result = {
                version: 1,
                status: 'error',
                max_score: inputs.maxScore,
                tests: [{
                    name: inputs.testName || 'Unknown Test',
                    status: 'error',
                    message: 'Error running setup command, see ' + (inputs.testName || 'Unknown Test') + ' above for more details',
                    test_code: `${inputs.setupCommand || 'Unknown Command'}`,
                    filename: '',
                    line_no: 0,
                    execution_time: 0,
                }],
            }

            console.error('❌ Error running setup command')
            console.error('This is probably something your teacher needs to fix')
            console.error()

            console.error('Command: ' + inputs.setupCommand)
            console.error('Error: ' + rs.error.message)

            if (rs.stdout) {
                console.error('stdout:')
                console.error(rs.stdout.toString())
                console.error()
            }

            if (rs.stderr) {
                console.error('stderr:')
                console.error(rs.stderr.toString())
            }

            core.setOutput('result', btoa(JSON.stringify(result)))

            // Tell next stop to not bother
            return false;

        }
    }

    return true;
}

/**
 * Build the java code. 
 * 
 * We don't care about output here, just that it builds without an error code > 0.
 */
function build(inputs) {

    try {
        rs = execSync(inputs.buildCommand, {
            timeout: inputs.timeout,
            stdio: 'pipe',
            env,
        })

        // Don't care about the output, just that it builds without an error code > 0
        return true;
    } catch (error) {
        const result = {
            version: 1,
            status: 'error',
            max_score: inputs.maxScore,
            tests: [{
                name: inputs.testName || 'Unknown Test',
                status: 'error',
                message: 'Error building submitted code, see ' + (inputs.testName || 'Unknown Test') + ' above for more details',
                test_code: `${inputs.buildCommand || 'Unknown Command'}`,
                filename: '',
                line_no: 0,
                execution_time: 0,
            }],
        }

        console.error()
        console.error('❌ Error building Java code')

        if (error.stdout && error.stdout.length > 0) {
            console.error();
            console.error('Standard Output:')
            console.error(error.stdout.toString().trim())
        }

        if (error.stderr && error.stderr.length > 0) {
            console.error()
            console.error('Error Output:')
            console.error(error.stderr.toString().trim())
        }

        core.setOutput('result', btoa(JSON.stringify(result)))

        return false
    }

}

function run(inputs) {
    try {
        rs = execSync(inputs.runCommand, {
            timeout: inputs.timeout,
            stdio: 'pipe',
            env,
        })

        rs = rs.toString()

        // Parse, we really only care about the dot lines and test count since
        // this was a successful run. The dot lines are immediately after the
        // version
        let re = /version\s*\d+\.\d+(\.\d+)\r?\n(.*?)(\r?\n|$)/g
        let match = re.exec(rs)
        let dots = match[2] || ''

        console.log('✅ ' + dots.length + ' test' + (dots.length > 1 ? 's' : '') + ' passed')


        // All tests passed
        const result = {
            version: 1,
            status: 'pass',
            max_score: inputs.maxScore,
            tests: [
                {
                    name: inputs.testName || 'Unknown Test',
                    status: 'pass',
                    message: 'Tests passed',
                    test_code: `${inputs.runCommand || 'Unknown Command'}`,
                    filename: '',
                    line_no: 0,
                    execution_time: 0,
                    score: inputs.maxScore,
                }
            ],
        }

        core.setOutput('result', btoa(JSON.stringify(result)))

    } catch (error) {
        // Possible that some tests passed, so we'll have to parse the output and figure it out
        const result = {
            version: 1,
            status: 'error',
            max_score: inputs.maxScore,
            tests: [{
                name: inputs.testName || 'Unknown Test',
                status: 'error',
                message: 'Error running tests, see ' + (inputs.testName || 'Unknown Test') + ' above for more details',
                test_code: `${inputs.runCommand || 'Unknown Command'}`,
                filename: '',
                line_no: 0,
                execution_time: 0,
            }],
        }

        let stdOut = error.stdout ? error.stdout.toString().trim() : ''
        let re = /version\s*\d+\.\d+(\.\d+)\r?\n(.*?)(\r?\n|$)/g
        let match = re.exec(stdOut)
        let dots = match[2] || ''

        // Count the periods to get the number of tests
        let testCount = dots.match(/\./g).length
        let errorCount = dots.match(/E/gi).length

        if (inputs.partialCredit) {
            // Calculate the score based on the number of tests passed
            let score = (testCount - errorCount) / testCount * inputs.maxScore
            result.tests[0].score = +score.toFixed(2)
        } else {
            // If partial credit is not allowed, then we only get credit if all tests pass
            result.tests[0].score = 0
        }

        console.error()
        if (testCount === errorCount) {
            console.error('❌ All ' + testCount + ' tests failed (0 of ' + inputs.maxScore + ' points)')
        } else {
            console.error('❌ ' + errorCount + ' of ' + testCount + ' tests failed (' + result.tests[0].score + ' of ' + inputs.maxScore + ' points)')
        }

        // Get the error lines for mesages
        let reFailures = /^\d+\)\s+.*$\s(.*)$/gm
        let matchesFailures = []

        let table = new Table({
            head: ['Message', 'Expected', 'Actual'],
        })

        for (const match of stdOut.matchAll(reFailures)) {
            let msg = match[1].trim()

            if (msg.match(/^java\.lang\.AssertionError: /i)) {
                // It's an assertion error
                msg = msg.replace(/^java\.lang\.AssertionError: /i, '').trim()

                // Get the message, expected, and actual values
                let message = msg.replace(/expected:\s*<.*>\s*but was:\*?<.*>$/i, '').trim()
                let expected = ''
                let actual = ''
                let reExpected = /expected:\s*<(.*)>\s*but was:\s*<(.*)>$/i
                let matchExpected = reExpected.exec(msg)
                if (matchExpected) {
                    expected = matchExpected[1]
                    actual = matchExpected[2]
                }

                table.push([message || 'Unexpected Result', expected, actual])
            } else {
                // It's an exception, needs to fill the table
                let reReplace = [
                    /java\.lang\.(.*):/i,
                    /org\.junit\.runners\.model\.TestTimedOutException: (.*)/i,
                ]

                for (const re of reReplace) {
                    msg = msg.replace(re, '').trim()
                }

                table.push([{
                    colSpan: 3,
                    content: msg  // Don't need extra info here
                }])
            }
        }

        console.log(table.toString())

        if (error.stderr && error.stderr.length > 0) {
            console.error()
            console.error('Error Output:')
            console.error(error.stderr.toString().trim())
        }

        core.setOutput('result', btoa(JSON.stringify(result)))

        return false
    }

}

function btoa(str) {
    return Buffer.from(str).toString('base64')
}

let inputs = getInputs()

if (setup(inputs)) {
    if (build(inputs)) {
        run(inputs)
    }
}