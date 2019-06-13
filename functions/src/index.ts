import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as rp from 'request-promise';
import * as cheerio from 'cheerio';

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

interface Header {
  text: string,
  sections: Array<Section>
}

interface Section {
  text: string,
  items: Array<Item | Category>
}

interface Category {
  text: string,
  category: true,
  items: Array<Item>
}

interface Item {
  text: string,
  url: string,
  category: false,
  lastUpdated?: string
}

interface Page {
  lastUpdated: string
};

const fetchItems = (): Promise<Array<Header>> => {
  return new Promise<Array<Header>>((resolve, reject) => {
    rp.get('https://developers.google.com/actions/overview', {
      transform: body => {
        return cheerio.load(body);
      }
    }).then($ => {
      const navItems = $('#gc-wrapper > div > nav > ul > li');
      const headers: Array<Header> = [];
      let currentHeader: Header | null = null;
      navItems.each((i: number, navItem: any) => {
        if ($(navItem).hasClass('devsite-nav-item-heading')) {
          const headingText = $(navItem).children('span').text();
          currentHeader = {
            text: headingText,
            sections: []
          };
          headers.push(currentHeader);
        } else {
          const sectionText = $(navItem).children('span').text();
          const section: Section = {
            text: sectionText,
            items: []
          };
          currentHeader!.sections.push(section);
          $(navItem).children('ul').each((i: number,ul: any) => {
            const items = $(ul).children('li');
            items.each((i: number, item: any) => {
              if ($(item).hasClass('devsite-nav-item-section-expandable')) {
                const category = {
                  text: $(item).children('span').text(),
                  category: true,
                  items: []
                } as Category;
                section.items.push(category);
                $(item).find('ul>li').each((i: number, item: any) => {
                  const link = $(item).children('a');
                  category.items.push({
                    text: link.text(),
                    url: link.attr('href'),
                    category: false
                  });
                });
              } else {
                const link = $(item).children('a');
                section.items.push({
                  text: link.text(),
                  url: link.attr('href'),
                  category: false
                });
              }
            });
          });
        }
      });
      resolve(headers);
    });
  });
}

const fetchPage = (item: Item): Promise<Page> => {
  return new Promise((resolve, reject) => {
    rp.get(item.url, {
      transform: body => {
        return cheerio.load(body);
      }
    }).then($ => {
      resolve({
        lastUpdated: $('p[itemprop="datePublished"]').attr('content')
      } as Page);
    });
  });
};

const isReferenceDocument = (url: string): boolean => {
  return url.startsWith('https://developers.google.com/actions/');
};

const crawlEachPageAndStoreToFirestore = (headers: Array<Header>): Promise<void> => {
  return new Promise<void>(async (resolve, reject) => {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const headerRef = await db.collection('headers').add({
        text: header.text,
        index: i
      });
      for (let j = 0; j < header.sections.length; j++) {
        const section = header.sections[j];
        const sectionRef = await db.collection('sections').add({
          header_id: headerRef.id,
          text: section.text,
          index: j
        });
        for (let k = 0; k < section.items.length; k++) {
          const item = section.items[k];
          if (item.category) {
            const itemRef = await db.collection('items').add({
              parent_id: sectionRef.id,
              text: item.text,
              category: true,
              index: k
            });
            for (let l = 0; l < item.items.length; l++) {
              const subItem = item.items[l];
              const entity = {
                parent_id: itemRef.id,
                text: subItem.text,
                category: false,
                url: subItem.url,
                index: l
              } as Item;
              if (isReferenceDocument(subItem.url)) {
                const page = await fetchPage(subItem);
                subItem.lastUpdated = page.lastUpdated;
                if (subItem.lastUpdated) {
                  entity.lastUpdated = subItem.lastUpdated
                }
              }
              await db.collection('items').add(entity);
            }
          } else {
            const entity = {
              parent_id: sectionRef.id,
              text: item.text,
              category: false,
              url: item.url,
              index: k
            } as Item;
            if (isReferenceDocument(item.url)) {
              const page = await fetchPage(item);
              item.lastUpdated = page.lastUpdated;
              if (item.lastUpdated) {
                entity.lastUpdated = item.lastUpdated;
              }
            }
            await db.collection('items').add(entity);
          }
        }
      }
    }
    resolve();
  });
};

const deleteAllDataInFirestore = (): Promise<void> => {
  return new Promise<void>(async (resolve, reject) => {
    const batch = db.batch();
    let snapshot = await db.collection('headers').get();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    snapshot = await db.collection('sections').get();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    snapshot = await db.collection('items').get();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    resolve();
  });
}

const loadDataFromFirestore = (): Promise<Array<Header>> => {
  return new Promise<Array<Header>>(async (resolve, reject) => {
    const result: Array<Header> = [];
    const headersQuerySnapshot = await db.collection('headers').orderBy('index').get();
    for (const headerQueryDocSnapshot of headersQuerySnapshot.docs) {
      const headerId = headerQueryDocSnapshot.id;
      const headerDoc = headerQueryDocSnapshot.data();
      const header: Header = {
        text: headerDoc.text,
        sections: []
      };
      result.push(header);
      const sectionsQuerySnapshot = await db.collection('sections').where('header_id', '==', headerId).orderBy('index').get();
      for (const sectionQueryDocSnapshot of sectionsQuerySnapshot.docs) {
        const sectionId = sectionQueryDocSnapshot.id;
        const sectionDoc = sectionQueryDocSnapshot.data();
        const section: Section = {
          text: sectionDoc.text,
          items: []
        };
        header.sections.push(section);
        const itemsQuerySnapshot = await db.collection('items').where('parent_id', '==', sectionId).orderBy('index').get();
        for (const itemQueryDocSnapshot of itemsQuerySnapshot.docs) {
          const itemId = itemQueryDocSnapshot.id;
          const itemDoc = itemQueryDocSnapshot.data();
          if (itemDoc.category) {
            const category: Category = {
              text: itemDoc.text,
              category: itemDoc.category,
              items: []
            };
            section.items.push(category);
            const subItemsQuerySnapshot = await db.collection('items').where('parent_id', '==', itemId).orderBy('index').get();
            for (const subItemQueryDocSnapshot of subItemsQuerySnapshot.docs) {
              const subItemDoc = subItemQueryDocSnapshot.data();
              const item: Item = {
                text: subItemDoc.text,
                category: subItemDoc.category,
                url: subItemDoc.url,
                lastUpdated: subItemDoc.lastUpdated
              };
              category.items.push(item);
            };
          } else {
            const item: Item = {
              text: itemDoc.text,
              category: itemDoc.category,
              url: itemDoc.url,
              lastUpdated: itemDoc.lastUpdated
            };
            section.items.push(item);
          }
        };
      };
    };
    resolve(result);
  });
};

export const fetchAogDocOverview = functions.https.onRequest(async (request, response) => {
  const headers = await loadDataFromFirestore();
  response.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  response.status(200).json(headers);
});

const runtimeOptions = {
  timeoutSeconds: 300
};

export const crawlAogDocOverview = functions.runWith(runtimeOptions).pubsub.topic('crawl').onPublish(async message => {
  console.log('Start: crawlAogDocOverview');
  const headers = await fetchItems();
  await deleteAllDataInFirestore();
  await crawlEachPageAndStoreToFirestore(headers);
  console.log('End: crawlAogDocOverview');
  return 0;
});
