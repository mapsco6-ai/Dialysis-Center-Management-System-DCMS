// @nestjs/common (and friends) ship ESM-only from this version on, so the
// test runner has to load them as ESM too - see the "test" script in
// package.json, which enables Node's --experimental-vm-modules for this.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true, tsconfig: { module: "ESNext", moduleResolution: "Bundler" } }],
  },
};
