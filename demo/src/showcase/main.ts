import { EvEm } from '@jcfigueiredo/evem';

// The page's own events go through EvEm (a later task replaces this file)
const bus = new EvEm();
bus.subscribe<string>('page.ready', title => console.info(`${title} is ready`));
void bus.publish('page.ready', document.title);
