import { render } from 'preact';
import { LocationProvider, Router, Route } from 'preact-iso';

import { Header } from './components/Header.js';
import { Home } from './pages/Home/index.js';
import { NotFound } from './pages/_404.js';
import './style.css';

export function App() {
	return (
		<LocationProvider>
			<Header />
			<main>
				<Router>
					<Route path="/" component={Home} />
					<Route default component={NotFound} />
				</Router>
			</main>
		</LocationProvider>
	);
}

const root = document.getElementById('app');
if (root) {
	render(<App />, root);
} else {
	// Fail fast if the mount node is missing
	throw new Error("Root element with id 'app' not found");
}
