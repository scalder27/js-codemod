'use strict';

const defineTest = require('jscodeshift/dist/testUtils').defineTest;

const options = {
  quote: 'single',
  package: 'react-router',
  modulesDir: 'lib',
};

defineTest(__dirname, 'split-imports-of-module', options);
