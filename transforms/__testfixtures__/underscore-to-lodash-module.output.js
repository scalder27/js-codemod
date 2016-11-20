import {chain} from 'lodash';
import contains from 'lodash/includes';
import merge from 'lodash/merge';
import map from 'lodash/map';
import reduce from 'lodash/reduce';
import delay from 'lodash/delay';

import React, { PropTypes } from 'react';
import { findDOMNode } from 'react-dom';

map([1, 2, 3], n => n * 3);
reduce(map([1, 3, 4]), (sum, num) => sum + num, 0);
delay(() => {}, 10);
contains(merge({}, {}), 'key');
chain([1, 2, 3]).values().value();