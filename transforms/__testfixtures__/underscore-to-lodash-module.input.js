import $, { contains } from 'underscore';
import { merge } from 'lodash';
import * as lo from 'lodash';

import React, { PropTypes } from 'react';
import { findDOMNode } from 'react-dom';

_.map([1, 2, 3], n => n * 3);
_.reduce(_.map([1, 3, 4]), (sum, num) => sum + num, 0);
lo.delay(() => {}, 10);
contains(merge({}, {}), 'key');
$.chain([1, 2, 3]).values().value();