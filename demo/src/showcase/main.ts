import '../styles.css';
import { EvEm } from '@jcfigueiredo/evem';
import { mountThemePicker } from '../theme';

// The showcase's own events go through EvEm, like the playground's
const bus = new EvEm();
mountThemePicker(document.getElementById('theme-picker')!, bus, 'dropdown-end');
