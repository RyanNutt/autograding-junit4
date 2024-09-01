const { execSync } = require('child_process')
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
 * Execute the setup command, if needed
 */
function setup(inputs) {
    if (inputs.setupCommand) {
        try {
            execSync(inputs.setupCommand, {
                timeout: inputs.timeout,
                stdio: 'inherit',
                env,
            })
        } catch (error) {
            const result = {
                version: 1,
                status: 'error',
                max_score: inputs.maxScore,
                tests: [{
                    name: inputs.testName || 'Unknown Test',
                    status: 'error',
                    message: error.message,
                    test_code: `${inputs.setupCommand || 'Unknown Command'}`,
                    filename: '',
                    line_no: 0,
                    execution_time: 0,
                }],
            }

            console.error('Error running setup command')
            console.error('This is probably something your teacher needs to fix')
            console.error()

            console.error('Message: ' + error.message)

            console.error()

            if (error.stdout) {
                console.error('stdout:')
                console.error(error.stdout.toString())
                console.error()
            }
            if (error.stderr) {
                console.error('stderr:')
                console.error(error.stderr.toString())
            }

            core.setOutput('result', btoa(JSON.stringify(result)))

            // Tell the next functions not to bother
            return false;
        }
    }

    return true;
}

function build(inputs) {
    try {
        execSync(inputs.buildCommand, {
            timeout: inputs.timeout,
            stdio: 'inherit',
            env,
        })
    } catch (error) {
        const result = {
            version: 1,
            status: 'error',
            max_score: 0,
            tests: [{
                name: inputs.testName || 'Unknown Test',
                status: 'error',
                message: error.message,
                test_code: `${inputs.buildCommand || 'Unknown Command'}`,
                filename: '',
                line_no: 0,
                execution_time: 0,
            }],
        }

        console.error('Error building Java code')
        console.error()
        console.error('Error: ' + error.message)
        console.error()
        console.error('stdout:')
        console.error(error.stdout.toString())
        console.error()
        console.error('stderr:')
        console.error(error.stderr.toString())



        core.setOutput('result', btoa(JSON.stringify(result)))

        return false
    }

    return true
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