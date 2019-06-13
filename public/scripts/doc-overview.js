'use strict';

class DocOVerview {

  constructor() {
    this.originalHeadings_ = null;
  }

  appendDivElement(parent, className, text) {
    const div = document.createElement('div');
    div.setAttribute('class', className);
    if (text) {
      div.innerText = text;
    }
    parent.appendChild(div);
    return div;
  }

  appendItemContentDivElement(parent, item) {
    const itemLink = document.createElement('a');
    itemLink.setAttribute('href', item.url);
    itemLink.innerText = item.text;
    const itemContent = this.appendDivElement(parent, 'item-content');
    itemContent.appendChild(itemLink);
    if (item.lastUpdated) {
      const lastUpdated = document.createElement('div');
      const date = moment(item.lastUpdated, 'YYYY-MM-DDTHH:mm:ss');
      const baseDate = moment().subtract(1, 'months');
      lastUpdated.setAttribute('class', date.isAfter(baseDate) ? 'last-updated-recent' : 'last-updated');
      lastUpdated.innerText = date.format('MMM Do YYYY');
      itemContent.appendChild(lastUpdated);
    }
    return itemContent;
  }

  updateItems(headings) {
    return new Promise((resolve, reject) => {
      const columns = document.querySelector('#columns');
      columns.innerHTML = '';
      headings.forEach(heading => {
        heading.sections.forEach(section => {
          const itemColumn = this.appendDivElement(columns, 'item-column');
          this.appendDivElement(itemColumn, 'item-heading', heading.text);
          this.appendDivElement(itemColumn, 'item-section', section.text);
          section.items.sort((a, b) => {
            if (a.category && !b.category) {
              return 1;
            } else if (!a.category && b.category) {
              return -1;
            } else {
              return 0;
            }
          });
          section.items.forEach(item => {
            if (item.category) {
              this.appendDivElement(itemColumn, 'item-category', item.text);
              item.items.forEach(item => {
                this.appendItemContentDivElement(itemColumn, item);
              });
            } else {
              this.appendItemContentDivElement(itemColumn, item);
            }
          });
        });
      });
      resolve();
    });
  }

  filterByKeyword(headings) {
    return new Promise((resolve, reject) => {
      const keywordField = document.querySelector('#keyword');
      const keyword = keywordField.value.toLowerCase();
      const filteredHeadings = [];
      headings.forEach(heading => {
        const copiedHeading = {
          text: heading.text,
          sections: []
        };
        heading.sections.forEach(section => {
          if (section.text.toLowerCase().includes(keyword)) {
            copiedHeading.sections.push(section);
          } else {
            const copiedSection = {
              text: section.text,
              items: []
            };
            section.items.forEach(item => {
              if (item.category) {
                if (item.text.toLowerCase().includes(keyword)) {
                  copiedSection.items.push(item);
                } else {
                  const copiedCategory = {
                    text: item.text,
                    items: [],
                    category: true
                  };
                  item.items.forEach(item => {
                    if (item.text.toLowerCase().includes(keyword)) {
                      copiedCategory.items.push(item);
                    }
                  });
                  if (copiedCategory.items.length > 0) {
                    copiedSection.items.push(copiedCategory);
                  }
                }
              } else {
                if (item.text.toLowerCase().includes(keyword)) {
                  copiedSection.items.push(item);
                }
              }
            });
            if (copiedSection.items.length > 0) {
              copiedHeading.sections.push(copiedSection);
            }
          }
        });
        if (copiedHeading.sections.length > 0) {
          filteredHeadings.push(copiedHeading);
        }
      });
      resolve(filteredHeadings);
    });
  }

  start() {
    this.fetchItems().then(headings => {
      this.originalHeadings_ = headings;
      return this.filterByKeyword(headings);
    }).then(headings => {
      return this.updateItems(headings);
    }).then(() => {
      const keywordField = document.querySelector('#keyword');
      keywordField.addEventListener('keyup', () => {
        this.filterByKeyword(this.originalHeadings_).then(headings => {
          return this.updateItems(headings);
        })
      });
    });
  }

  fetchItems() {
    return new Promise((resolve, reject) => {
      fetch('/doc-overview/api')
        .then(response => {
          return response.json();
        })
        .then(json => {
          const loading = document.querySelector('#loading');
          loading.style.display = 'none';
          resolve(json);
        });
    });
  }
}

window.addEventListener('load', () => {
  new DocOVerview().start();
});
