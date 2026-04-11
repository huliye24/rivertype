import { App } from './app';
import './styles/main.css';

const container = document.getElementById('app');
if (container) {
  new App(container);
}
