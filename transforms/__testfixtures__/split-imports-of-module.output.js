import RouterLink from 'react-router/lib/Link';
import Provider from 'react-router/lib/Provider';
import withRouter from 'react-router/lib/withRouter';
import Router from 'react-router/lib/Router';
import Route from 'react-router/lib/Route';

const wrapper = withRouter((props) => (
  <div>
    {props.location.path}
  </div>
));

const routes = (
  <Router history={{}}>
    <Route path='/' component={wrapper} />
  </Router>
);