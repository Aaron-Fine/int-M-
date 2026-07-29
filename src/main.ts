import './styles.css';
import { mountApplication } from './ui/application';

const host = document.querySelector<HTMLElement>('#app');

if (!host) {
  throw new Error('Application host #app was not found.');
}

mountApplication(host);
