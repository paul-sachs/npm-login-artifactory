# Purpose

Simplify configuring your npmrc file for using artifactory credentials with npm. It is designed to be run as a CLI, installed through npm or npx:

```bash
npx https://github.com/psachs21/npm-login-artifactory.git
```

or

```bash
npm i https://github.com/psachs21/npm-login-artifactory.git
npm-login-artifactory
```

# Config

There are a couple of ways to use the tool, from command line args to a config file. To see command line args, run `npm-login-artifactory -h`.

You can preconfigure an npmartrc so the tool can read some defaults:

.npmartrc
```json
{
    "hostname": "na.artifactory.swg-devops.com",
    "registries": ["@fss=>ip-wfss-npm-virtual"]
}
```

## Options

- hostname: (string) hostname to your artifactory repository
- registries: (string[]) list of registries to map scopes to registries. Format is @<scope> => <repo_name>
- email: (string) user email to login via
- password: (string) password or api key
- skipApiKey: (boolean) if enabled, store the password in your npmrc file. Otherwise the tool will try to fetch an api key from artifactory
