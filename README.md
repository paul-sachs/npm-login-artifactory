# Purpose

Simplify configuring your npmrc file for using artifactory credentials with npm. It is designed to be run as a CLI, installed through npm or npx:

```bash
npx git+ssh://git@github.ibm.com:watson-finance/npm-login-artifactory.git
```

or

```bash
npm i -g git+ssh://git@github.ibm.com:watson-finance/npm-login-artifactory.git
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