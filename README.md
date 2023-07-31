# octoherd-script-renovate-library-major-version-driver

<!-- [![@latest](https://img.shields.io/npm/v/@octoherd/script-hello-world.svg)](https://www.npmjs.com/package/@octoherd/script-hello-world) -->
[![Build Status](https://github.com/time-loop/octoherd-script-renovate-library-major-version-driver/workflows/Test/badge.svg)](https://github.com/time-loop/octoherd-script-renovate-library-major-version-driver/actions?query=workflow%3ATest+branch%3Amain)

## Usage

```bash
nvm use v18
node cli.js \
  -R time-loop/*-cdk \
  -T ghp_0123456789abcdefghijABCDEFGHIJabcdefgh \
  --octoherd-bypass-confirms true \
  --majorVersion v11
```

## Options

| option            | type   | default | description        |
| ----------------- | ------ | ------- | ------------------ |
| `--majorVersion`  | string | none    | major version number for the library, for example v11 |
| `--libray`        | string | `@time-loop/cdk-library` | full name of the library to be updated via renovate |


## Limitations

- Should be re-written in TypeScript, but all examples were JS, and we're tight for time.
- Doesn't differentiate between failed status checks which are required vs optional.
- Doesn't generate renovate PRs.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[ISC](LICENSE.md)
