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
    const testClasses = core.getInput('test-class', { required: true }).split(/\s*,\s*/)
    const setupCommand = core.getInput('setup-command')
    const timeout = parseFloat(core.getInput('timeout') || 5) * 60_000 // Minutes to milliseconds
    const maxScore = parseFloat(core.getInput('max-score') || 0)
    const libFolder = core.getInput('lib-path') || 'lib'
    const partialCredit = core.getInput('partial-credit') === 'true'
    const buildList = core.getInput('build');
    const stackTrace = core.getInput('stacktrace') === 'true';

    let buildFiles = '';
    if (buildList == "" || buildList == "*") {
        buildFiles = '*.java'
    } else {
        buildFiles = buildList.split(/\s*,\s*/);

        buildFiles = buildFiles.map((file) => {
            if (!file.match(/\.java?$/i)) {
                return file + '.java';
            }
            return file;
        });
        buildFiles = buildFiles.join(' ');
    }


    const buildCommand = 'javac -cp "' + libFolder + '/*" -d . ' + buildFiles;
    const runCommand = 'java -cp "' + libFolder + '/*:." org.junit.runner.JUnitCore ' + testClasses.join(' ')

    return { testName, testClasses, setupCommand, timeout, maxScore, libFolder, partialCredit, buildCommand, runCommand, stackTrace }
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
            let markdown = ':x: Error running setup command\n\nThis is probably something that your teacher needs to fix\n\n```shell\n' + inputs.setupCommand + '\n```\n\nError: ' + rs.error.message;

            console.error('❌ Error running setup command')
            console.error('This is probably something your teacher needs to fix')
            console.error()

            console.error('Command: ' + inputs.setupCommand)
            console.error('Error: ' + rs.error.message)

            if (rs.stdout) {
                console.error('stdout:')
                console.error(rs.stdout.toString())
                console.error()

                markdown += '\n\nstdout:\n\n```\n' + rs.stdout.toString() + '\n```\n\n'
            }

            if (rs.stderr) {
                console.error('stderr:')
                console.error(rs.stderr.toString())

                markdown += '\n\nstderr:\n\n```\n' + rs.stderr.toString() + '\n```\n\n'
            }


            const result = {
                version: 1,
                status: 'error',
                max_score: inputs.maxScore,
                markdown: btoa(markdown),
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
        let markdown = ':x: Error building Java code\n\n';

        console.error()
        console.error('❌ Error building Java code')

        if (error.stdout && error.stdout.length > 0) {
            console.error();
            console.error('Standard Output:')
            console.error(error.stdout.toString().trim())

            markdown += '```\n' + error.stdout.toString().trim() + '\n```\n\n'
        }

        if (error.stderr && error.stderr.length > 0) {
            console.error()
            console.error('Error Output:')
            console.error(error.stderr.toString().trim())

            markdown += '```\n' + error.stderr.toString().trim() + '\n```\n\n'
        }

        const result = {
            version: 1,
            status: 'error',
            max_score: inputs.maxScore,
            markdown: btoa(markdown),
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

        let markdown = '✅ ' + dots.length + ' test' + (dots.length > 1 ? 's' : '') + ' passed';

        // All tests passed
        const result = {
            version: 1,
            status: 'pass',
            max_score: inputs.maxScore,
            markdown: btoa(markdown),
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
            markdown: '',
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

        let markdown = '';

        let stdOut = error.stdout ? error.stdout.toString().trim() : ''
        console.log(stdOut);
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
            markdown += ':x: All ' + testCount + ' tests failed (0 of ' + inputs.maxScore + ' points)\n\n'
        } else {
            console.error('❌ ' + errorCount + ' of ' + testCount + ' tests failed (' + result.tests[0].score + ' of ' + inputs.maxScore + ' points)')
            markdown += ':x: ' + errorCount + ' of ' + testCount + ' tests failed (' + result.tests[0].score + ' of ' + inputs.maxScore + ' points)\n\n'
        }

        // Get the error lines for mesages
        let reFailures = /^\d+\)\s+.*$\s(.*)$/gm
        let matchesFailures = []

        let table = new Table({
            head: ['Message', 'Expected', 'Actual'],
        })

        let htmlTable = '<table><thead><tr><th>Message</th><th>Expected</th><th>Actual</th></tr></thead><tbody>';

        let failures = stdOut.split(/^\d+\).*$/m);
        failures.shift();

        for (let failure of failures) {

            // Get rid of everything except the message
            let reReplace = [
                /java\.lang\.(.*?):/i,
                /org\.junit\.runners\.model\.TestTimedOutException:/i,
                /^\t+at(.*)$/gm, // tabbed in locations of error stack
                /^\t+\.\.\.(.*)$/gm, // tabbed in "trimmed" message
                /^Caused by: (.*)$/gm, // Caused by message, seems to only show up in assertArrayEquals
                /^FAILURES(.*)$/gm, // FAILURES message
                /^Tests run:(.*)$/gm, // Tests run message
            ];

            for (const re of reReplace) {
                failure = failure.replace(re, '').trim();
            }

            if (failure.match(/expected\s*:\s*<(.*)>\s*but was\s*:\s*<(.*)>/g)) {
                // expected and actual are there, use them
                let matches = failure.matchAll(/(.*)expected\s*:\s*<(.*)>\s*but was\s*:\s*<(.*)>/g);
                if (matches) {
                    for (let match of matches) {
                        match[1] = match[1].trim() || ''
                        table.push([match[1] || 'Test failed', match[2], match[2]])
                        htmlTable += '<tr><td>' + (match[1] || 'Test failed') + '</td><td>' + match[2].trim().replace(/(?:\r\n|\r|\n)/g, '<br>') + '</td><td>' + match[3].trim().replace(/(?:\r\n|\r|\n)/g, '<br>') + '</td></tr>'
                    }
                } else {
                    table.push([{
                        colSpan: 3,
                        content: failure
                    }]);
                    htmlTable += '<tr><td colspan="3">' + failure + '</td></tr>';
                }
            } else {
                // Some other message, just output as-is
                table.push([{
                    colSpan: 3,
                    content: failure,
                }]);
                htmlTable += '<tr><td colspan="3">' + failure + '</td></tr>';

            }

        }
        htmlTable += '</tbody></table>';

        markdown += htmlTable;

        console.log(table.toString())

        if (error.stderr && error.stderr.length > 0) {
            console.error()
            console.error('Error Output:')
            console.error(error.stderr.toString().trim())

            markdown += '\n\nError Output:\n\n```\n' + error.stderr.toString().trim() + '\n```\n\n'
        }

        if (inputs.stackTrace) {
            markdown += '<details><summary>View full stack trace</summary>\n\n```\n' + stdOut.trim() + '\n```\n\n</details>'
        }

        result.markdown = btoa(markdown);

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