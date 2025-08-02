# JUnit4 Autograder for GitHub Classroom

JUnit4 autograding action for GitHub Classroom, based on [classroom-resources/autograding-io-grader](https://github.com/classroom-resources/autograding-io-grader/), modified to 
parse JUnit4 results.

### Config settings

|Option | Description |
| --- | --- |
| test-name | Unique identifier for this specific test | 
| setup-command | (optional) Command executed prior to running the tests, e.g. `mvn install`. DO NOT include `javac` here, it is taken care of already. |
| test-class | Name of the test class to execute. Should be the test class, no the filename. |
| timeout | (optional) Number of minutes before test is considered a failure. Defaults to 5 minutes. | 
| max-score | (optional) Max points a student can receive for this test. Defaults to 0. |
| lib-path | Path to the JUnit and Hamcrest JAR files, and any additional JAR files |
| partial-credit | (optional) If set to true, the autograder will return partial credit for tests that fail. Defaults to false. |

### Example config

```yaml

# Settings above the tests

jobs:
  run-autograding-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # Test settings go here
      - name: Example Unit Test
        id: example-unit-test
        uses: compscirocks/autograding-io-grader@main
        with:
          test-name: Test Unit Test
          test-class: Test_Classname
          lib-path: ./.lib
          timeout: 5
          max-score: 100
      # End of test

      # Any other jobs that need to run

# Settings after the jobs