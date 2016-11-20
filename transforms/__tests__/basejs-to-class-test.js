'use strict';

const defineTest = require('jscodeshift/dist/testUtils').defineTest;

const options = {
  quote: 'single',
};

defineTest(__dirname, 'basejs-to-class', options);
