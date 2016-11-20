import ReactRouter, { Link as RouterLink, default as router, Provider, withRouter } from 'react-router';
import Router, * as RouterNamespace from 'react-router';

const wrapper = router.withRouter((props) => (
  <div>
    {props.location.path}
  </div>
));

const routes = (
  <RouterNamespace.Router history={{}}>
    <RouterNamespace.Route path='/' component={wrapper} />
  </RouterNamespace.Router>
);