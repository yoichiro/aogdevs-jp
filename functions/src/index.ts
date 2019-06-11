import * as functions from 'firebase-functions';
import * as rp from 'request-promise';
import * as cheerio from 'cheerio';

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
  category: false
}

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

export const fetchAogDocOverview = functions.https.onRequest(async (request, response) => {
  const headers = await fetchItems();
  response.status(200).json(headers);
});
