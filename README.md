# octoherd-script-renovate-library-major-version-driver

<!-- [![@latest](https://img.shields.io/npm/v/@octoherd/script-hello-world.svg)](https://www.npmjs.com/package/@octoherd/script-hello-world) -->
[![Build Status](https://github.com/time-loop/octoherd-script-renovate-library-major-version-driver/workflows/Test/badge.svg)](https://github.com/time-loop/octoherd-script-renovate-library-major-version-driver/actions?query=workflow%3ATest+branch%3Amain)

## Usage

```bash
nvm use v18
node cli.js \
  -R time-loop/*-cdk \
  -T ghp_0123456789abcdefghijABCDEFGHIJabcdefgh \
  --majorVersion v11
```

## Options

| option            | type   | default | description        |
| ----------------- | ------ | ------- | ------------------ |
| `--majorVersion`  | string | none    | Major version number for the library, for example `v11`. If you provide `all` then it will instead address the `all non-major updates` PR. If you provide `projen`, it will address the `fix(deps): upgrade projen` PR. |
| `--library`       | string | `@time-loop/cdk-library` | Full name of library to be updated via renovate |
| `--maxAgeDays`    | number | 7 | The maximum age, in days, since when a PR was merge to consider it the relevant PR. Ignored except when doing `all non-major updates` |

### PAT Requirements

You will need a GH PAT with the following scopes (at a minimum):

- `repo` Full control of private repositories

## TODO

- detect and address case where PR is not up-to-date with base branch.


## Limitations

- Should be re-written in TypeScript, but all examples were JS, and we're tight for time.
- Not projen-ified, which is kinda tragic.
  I feel that these two technologies are deeply complementary.
  https://github.com/projen/projen/issues/2841
- Doesn't differentiate between failed status checks which are required vs optional.
  Or... maybe the rollup does? I haven't checked.
- Not published to npmjs.com, so you have to run it locally.
  We use github packages, so... we'll probably never publish this to npmjs.com.
  Either way, not a priority right now.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[ISC](LICENSE.md)
