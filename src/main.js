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

function execute() {

}

function run() {
    let inputs = {}

    try {
        inputs = getInputs()

        if (inputs.setupCommand) {
            execSync(inputs.setupCommand, {
                timeout: inputs.timeout,
                stdio: 'inherit',
                env,
            })
        }

        // Build the project
        console.log('Building the project...\n' + inputs.buildCommand)
        execSync(inputs.buildCommand, {
            timeout: inputs.timeout,
            stdio: 'inherit',
            env,
        })

        // Run the tests
        console.log('Running the tests...\n' + inputs.runCommand)
        const output = execSync(inputs.runCommand, {
            timeout: inputs.timeout,
            stdio: 'pipe',
            env,
        }).toString()

        console.log('Ran through all steps')
        console.log(output)

    } catch (error) {
        console.error(error)
        const result = {
            version: 1,
            status: 'error',
            tests: [
                {
                    name: inputs.testName || 'Unknown Test',
                    status: 'error',
                    message: error.message,
                    test_code: `${inputs.runCommand || 'Unknown Command'}`,
                    filename: '',
                    line_no: 0,
                    execution_time: 0,
                },
            ],
        }

        core.setOutput('result', btoa(JSON.stringify(result)))
    }
}

function btoa(str) {
    return Buffer.from(str).toString('base64')
}

run()