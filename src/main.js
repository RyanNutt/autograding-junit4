const { execSync, spawnSync, spawn } = require('child_process')
const core = require('@actions/core')

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

    let rs = spawnSync(inputs.buildCommand, {
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
                message: 'Error building submitted code, see ' + (inputs.testName || 'Unknown Test') + ' above for more details',
                test_code: `${inputs.buildCommand || 'Unknown Command'}`,
                filename: '',
                line_no: 0,
                execution_time: 0,
            }],
        }

        console.error()
        console.error('❌ Error building Java code')
        console.error('Error: \n' + rs.error.message)

        if (rs.stdout) {
            console.error('stdout:')
            console.error(rs.stdout.toString())
            console.error()
        }

        if (rs.stderr) {
            console.error('stderr:')
            console.error(rs.stderr.toString())
        }

        console.error(rs)

        core.setOutput('result', btoa(JSON.stringify(result)))

        return false
    }

    return true;
}

function run(inputs) {
    console.log('Running the tests...\n' + inputs.runCommand)

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