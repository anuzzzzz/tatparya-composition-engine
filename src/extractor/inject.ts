// ═══════════════════════════════════════════════════════════════
// Extractor — Returns a RAW JAVASCRIPT STRING
//
// Injected via page.addScriptTag({ content: ... }) then invoked
// via page.evaluate('extractDesignDNA()'). Plain JS, no TypeScript.
//
// FIX v3:
//   - isVisibleSection: relaxed (only display:none, hidden, opacity:0, height<10)
//   - looksLikePopup: targeted (z-index>100 + fixed/abs + popup classes)
//   - extractSections: 3-tier strategy:
//     1. .shopify-section (standard Shopify)
//     2. direct children of main/body (legacy)
//     3. deep scan for full-width block-level elements (React/headless)
// ═══════════════════════════════════════════════════════════════

export function getExtractorScript(): string {
  return `
function rgbToHex(rgb) {
  var match = rgb.match(/\\d+/g);
  if (!match) return rgb;
  var r = parseInt(match[0]), g = parseInt(match[1]), b = parseInt(match[2]);
  return '#' + [r,g,b].map(function(v){return v.toString(16).padStart(2,'0');}).join('');
}
function hexToRgbLocal(hex) {
  var result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1],16),parseInt(result[2],16),parseInt(result[3],16)] : [0,0,0];
}
function rgbToHslLocal(r,g,b) {
  r/=255;g/=255;b/=255;
  var max=Math.max(r,g,b),min=Math.min(r,g,b),h=0,s=0,l=(max+min)/2;
  if(max!==min){var d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return {h:h,s:s,l:l};
}
function isDarkBg(color) {
  if(!color||color==='transparent'||color==='rgba(0, 0, 0, 0)')return false;
  var m=color.match(/\\d+/g);if(!m||m.length<3)return false;
  return(0.299*parseInt(m[0])+0.587*parseInt(m[1])+0.114*parseInt(m[2]))<128;
}
function isDarkHex(hex){var rgb=hexToRgbLocal(hex);return(0.299*rgb[0]+0.587*rgb[1]+0.114*rgb[2])<128;}
function getElementDepth(el){var d=0,c=el;while(c&&c.parentElement){d++;c=c.parentElement;}return d;}
function getFirstHeading(el){var h=el.querySelector('h1,h2,h3');return h?h.textContent.trim().substring(0,100):null;}
function detectGridColumns(el) {
  var s=getComputedStyle(el);
  if(s.display==='grid'||s.display==='inline-grid'){var c=s.gridTemplateColumns.split(' ').filter(function(x){return x!=='';}).length;if(c>0)return c;}
  if(s.display==='flex'||s.display==='inline-flex'){
    var vc=Array.from(el.children).filter(function(c){var cs=getComputedStyle(c);return cs.display!=='none'&&c.getBoundingClientRect().width>50;});
    if(vc.length>0){var fy=vc[0].getBoundingClientRect().top;return vc.filter(function(c){return Math.abs(c.getBoundingClientRect().top-fy)<20;}).length;}}
  return 1;
}
function detectCarousel(el){return !!(el.querySelector('[class*="carousel"],[class*="slider"],[class*="swiper"],[class*="slick"]')||el.querySelector('[data-flickity],[data-slick]')||el.querySelector('.splide,.glide')||el.querySelector('[role="tablist"]'));}
function isGoldTone(hex){var r=hexToRgbLocal(hex);return r[0]>170&&r[1]>140&&r[1]<220&&r[2]<120&&r[0]>r[1];}
function isMaroonTone(hex){var r=hexToRgbLocal(hex);return r[0]>100&&r[0]<180&&r[1]<50&&r[2]<50;}
function isSaffronTone(hex){var r=hexToRgbLocal(hex);return r[0]>200&&r[1]>100&&r[1]<180&&r[2]<80;}
function isDeepGreen(hex){var r=hexToRgbLocal(hex);return r[0]<80&&r[1]>80&&r[1]<160&&r[2]<80;}

function scoreCandidate(s){var t=0;for(var k in s)t+=(s[k]||0);return t;}

function classifySection(el,si) {
  var text=el.textContent.trim().toLowerCase();
  var imgs=el.querySelectorAll('img');
  var headings=el.querySelectorAll('h1,h2,h3');
  var buttons=el.querySelectorAll('a[href],button');
  var rect=el.getBoundingClientRect();
  var style=getComputedStyle(el);
  var hc=detectCarousel(el);
  var gc=detectGridColumns(el);
  var c={};

  c.announcement_bar=scoreCandidate({a:rect.height<80?30:0,b:si===0?25:si===1?10:0,c:(text.length<200&&text.length>5)?20:0,d:el.closest('header,[role="banner"]')?20:0,e:headings.length>0?-15:0});

  var hb={a:si<=1?30:si<=3?10:-20,b:rect.height>window.innerHeight*0.5?25:rect.height>window.innerHeight*0.3?15:0,c:rect.height>300?10:0,d:buttons.length>=1&&buttons.length<=3?15:buttons.length>3?5:0,e:headings.length>0?10:0,f:rect.height<200?-40:0};

  c.hero_full_bleed=scoreCandidate(Object.assign({},hb,{g:(style.backgroundImage!=='none'||el.querySelector('img[style*="object-fit"]'))?15:0,h:gc>2?-10:0}));
  c.hero_split=scoreCandidate(Object.assign({},hb,{g:gc===2?20:0,h:imgs.length===0?-15:0}));
  c.hero_slideshow=scoreCandidate(Object.assign({},hb,{g:hc?25:0}));
  c.hero_bento=scoreCandidate(Object.assign({},hb,{g:imgs.length>=3?15:0,h:gc>=2?10:0}));
  c.hero_minimal=scoreCandidate(Object.assign({},hb,{g:style.backgroundImage==='none'?5:0,h:text.length>100?5:0,i:imgs.length>2?-10:0}));

  c.marquee=scoreCandidate({a:(el.querySelector('[style*="animation"]')||el.querySelector('[class*="marquee"]')||el.querySelector('[class*="ticker"]'))?40:0,b:rect.height<100?25:rect.height<150?10:-20,c:text.length<300?10:0});

  var si2=Array.from(imgs).filter(function(i){var r=i.getBoundingClientRect();return r.width<60&&r.height<60;});
  c.trust_bar=scoreCandidate({a:si2.length>=3?30:si2.length>=2?15:0,b:rect.height<200?20:0,c:text.length<500?15:0,d:text.match(/free.?ship|deliver|return|secure|payment|guarantee|cod/i)?20:0});

  c.logo_bar=scoreCandidate({a:(imgs.length>=3&&imgs.length<=10)?20:0,b:(function(){var w=Array.from(imgs).map(function(i){return i.getBoundingClientRect().width;});var avg=w.length>0?w.reduce(function(a,b){return a+b;},0)/w.length:0;return avg>30&&avg<150?25:0;})(),c:rect.height<150?15:0,d:text.match(/featured|seen|press|trusted|mentioned|partner|as seen/i)?25:0});

  var pc=el.querySelectorAll('[class*="product"],[class*="card"],[data-product-id],.grid__item');
  var hp=text.match(/\\u20B9|rs\\.|inr|\\$|price|add to cart|buy now/i);
  c.featured_products=scoreCandidate({a:pc.length>=3?25:pc.length>=2?10:0,b:gc>=2?15:0,c:hp?20:0,d:!hc?10:0,e:pc.length<2?-30:0});
  c.product_carousel=scoreCandidate({a:pc.length>=3?20:0,b:hc?30:0,c:hp?20:0});

  var cl=el.querySelectorAll('a[href*="collection"],a[href*="categor"]');
  c.category_grid=scoreCandidate({a:cl.length>=2?25:0,b:imgs.length>=2?15:0,c:gc>=2?15:0,d:text.match(/shop by|categor|collection/i)?15:0});
  c.category_pills=scoreCandidate({a:cl.length>=3?20:0,b:rect.height<200?20:0,c:gc>=3?15:0,d:text.match(/shop by|browse|categor/i)?10:0});

  c.collection_banner=scoreCandidate({a:(rect.height>200&&rect.height<window.innerHeight*0.6)?20:0,b:(style.backgroundImage!=='none'||isDarkBg(style.backgroundColor))?25:0,c:(buttons.length>=1&&buttons.length<=2)?15:0,d:(headings.length>=1&&headings.length<=2)?10:0,e:si>2?10:-5});

  c.testimonial_cards=scoreCandidate({a:text.match(/review|testimonial|customer|\\u2605|\\u2B50|rating|said|loved/i)?35:0,b:hc?15:0,c:pc.length>=2?10:0,d:(el.querySelector('blockquote')||text.match(/["\\u201C].*["\\u201D]/))?15:0});
  c.stats_bar=scoreCandidate({a:text.match(/\\d+[,.]?\\d*\\s*\\+?\\s*(customer|order|cities|store|review|rating|happy|product)/i)?40:0,b:rect.height<200?20:0,c:headings.length<=4?10:0});
  c.ugc_gallery=scoreCandidate({a:text.match(/instagram|#|ugc|gallery|community|tagged|real customer/i)?30:0,b:el.querySelector('[class*="instagram"],[class*="ugc"]')?25:0,c:imgs.length>=4?15:0});
  c.image_with_text=scoreCandidate({a:gc===2?20:0,b:(imgs.length>=1&&imgs.length<=2)?15:0,c:text.length>100?15:0,d:headings.length>=1?10:0,e:imgs.length>3?-20:0});
  c.about_brand=scoreCandidate({a:text.match(/about|our story|founded|mission|heritage|journey|since \\d{4}|crafted|handmade/i)?35:0,b:headings.length>=1?15:0,c:text.length>200?10:0});
  c.video_section=scoreCandidate({a:el.querySelector('video,iframe[src*="youtube"],iframe[src*="vimeo"]')?50:0,b:rect.height>200?10:0});
  c.quote_block=scoreCandidate({a:el.querySelector('blockquote')?35:0,b:text.match(/^["\\u201C].*["\\u201D]$/)?25:0,c:text.length<500?10:0});
  c.newsletter=scoreCandidate({a:el.querySelector('input[type="email"],form[action*="subscribe"],form[action*="newsletter"]')?40:0,b:text.match(/subscribe|newsletter|email.*updates|stay.*touch|join.*list|whatsapp/i)?25:0,c:rect.height<400?10:0});
  c.countdown_timer=scoreCandidate({a:text.match(/days?\\s*:\\s*hours?|countdown|ends in|hurry|limited/i)?40:0,b:text.match(/\\d+\\s*:\\s*\\d+/)?20:0});
  c.rich_text=scoreCandidate({a:(text.length>200&&imgs.length===0)?25:0,b:headings.length>=1?10:0,c:-10});
  c.lookbook=scoreCandidate({a:imgs.length>=4?20:0,b:text.length<100?15:0,c:(el.querySelector('[class*="lookbook"]')||el.querySelector('[class*="gallery"]'))?25:0});

  var best='unknown',bs=0;
  for(var t in c){if(c[t]>bs&&c[t]>=25){best=t;bs=c[t];}}
  return {type:best,confidence:Math.min(bs/100,1.0)};
}

function isVisibleSection(el) {
  var style = getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  var rect = el.getBoundingClientRect();
  if (rect.height < 10) return false;
  return true;
}

function looksLikePopup(el) {
  var style = getComputedStyle(el);
  var z = parseInt(style.zIndex) || 0;
  if (z <= 100) return false;
  if (style.position !== 'fixed' && style.position !== 'absolute') return false;
  var rect = el.getBoundingClientRect();
  var vpArea = window.innerWidth * window.innerHeight;
  var elArea = rect.width * rect.height;
  if (elArea > vpArea * 0.5) return true;
  var id = (el.id || '').toLowerCase();
  var cls = (el.className || '').toString().toLowerCase();
  if (id.match(/popup|modal|overlay/) || cls.match(/popup|modal|overlay|klaviyo|privy|omnisend/)) return true;
  return false;
}

function findDeepSections(container) {
  var allEls = Array.from(container.querySelectorAll('section, [data-section-type], [class*="section"], [class*="Section"], article'));
  var candidates = allEls.filter(function(el) {
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    return rect.width > window.innerWidth * 0.7 &&
           rect.height > 80 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  });
  if (candidates.length < 3) {
    var mainEl = container.querySelector('main') || container.querySelector('[role="main"]') || container.querySelector('#MainContent') || container;
    var stack = [mainEl];
    var checked = new Set();
    candidates = [];
    while (stack.length > 0) {
      var current = stack.pop();
      if (checked.has(current)) continue;
      checked.add(current);
      var children = Array.from(current.children).filter(function(ch) {
        var r = ch.getBoundingClientRect();
        var s = getComputedStyle(ch);
        return r.height > 50 && r.width > window.innerWidth * 0.5 && s.display !== 'none';
      });
      if (children.length === 1 && children[0].children.length > 1) {
        stack.push(children[0]);
      } else if (children.length > 1) {
        candidates = children.filter(function(ch) {
          var r = ch.getBoundingClientRect();
          return r.height > 80 && r.width > window.innerWidth * 0.7;
        });
        if (candidates.length >= 2) break;
        stack.push(children[0]);
      }
    }
  }
  var filtered = candidates.filter(function(cand) {
    return !candidates.some(function(other) {
      return other !== cand && cand.contains(other);
    });
  });
  return filtered.length >= 2 ? filtered : candidates;
}

function extractSections(){
  var sections=[];

  // Strategy 1: Standard .shopify-section elements
  var ss=document.querySelectorAll('.shopify-section');
  if(ss.length>0){
    Array.from(ss).forEach(function(s){
      if (!isVisibleSection(s)) return;
      if (looksLikePopup(s)) return;
      sections.push(analyzeSection(s, sections.length, 'shopify'));
    });
  }

  // Strategy 2: Direct children of main (legacy / simple themes)
  if(sections.length < 3){
    var main=document.querySelector('main')||document.querySelector('[role="main"]')||document.querySelector('#MainContent');
    if(main){
      var directKids = Array.from(main.children).filter(function(el){
        return isVisibleSection(el) && !looksLikePopup(el) && el.getBoundingClientRect().height > 50;
      });
      if(directKids.length >= 3){
        sections = [];
        directKids.forEach(function(s){
          sections.push(analyzeSection(s, sections.length, 'heuristic'));
        });
      }
    }
  }

  // Strategy 3: Deep scan for section-like elements (React/headless/custom themes)
  if(sections.length < 3){
    var deep = findDeepSections(document.body);
    if(deep.length >= 2){
      sections = [];
      deep.forEach(function(s){
        if (!isVisibleSection(s)) return;
        if (looksLikePopup(s)) return;
        sections.push(analyzeSection(s, sections.length, 'deep_scan'));
      });
    }
  }

  return sections;
}

function analyzeSection(el,index,method){
  var rect=el.getBoundingClientRect();var style=getComputedStyle(el);var st=classifySection(el,index);
  return{index:index,method:method,shopify_id:el.id||null,detected_type:st.type,confidence:st.confidence,height_px:rect.height,width_px:rect.width,is_full_width:rect.width>=window.innerWidth*0.95,viewport_ratio:rect.height/window.innerHeight,background_color:style.backgroundColor,background_image:style.backgroundImage!=='none'?style.backgroundImage:null,is_dark:isDarkBg(style.backgroundColor),padding_top:parseInt(style.paddingTop),padding_bottom:parseInt(style.paddingBottom),has_images:el.querySelectorAll('img').length,has_buttons:el.querySelectorAll('a,button').length,heading_text:getFirstHeading(el),text_content_length:el.textContent.trim().length,grid_columns:detectGridColumns(el),has_carousel:detectCarousel(el),has_video:!!(el.querySelector('video,iframe[src*="youtube"],iframe[src*="vimeo"]'))};
}

function extractPalette(){
  var ca={};
  document.querySelectorAll('body,header,nav,main,footer,section,.shopify-section,[class*="hero"],[class*="banner"],[class*="product"],[class*="card"],div,article').forEach(function(el){
    var rect=el.getBoundingClientRect();if(rect.width<10||rect.height<10)return;
    var s=getComputedStyle(el);var bg=s.backgroundColor;
    if(bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'){
      var hex=rgbToHex(bg);var area=rect.width*rect.height;var depth=getElementDepth(el);
      var dw=depth<5?1.0:depth<10?0.5:0.2;
      var rgb=hexToRgbLocal(hex);var hsl=rgbToHslLocal(rgb[0],rgb[1],rgb[2]);
      var vw=1+hsl.s-Math.abs(0.5-hsl.l);
      ca[hex]=(ca[hex]||0)+(area*dw*vw);
    }
  });
  var tc={};document.querySelectorAll('h1,h2,h3,p,a,button,span,li').forEach(function(el){var hex=rgbToHex(getComputedStyle(el).color);if(hex)tc[hex]=(tc[hex]||0)+1;});
  var ac={};document.querySelectorAll('button,a.btn,[class*="badge"],[class*="tag"],[class*="accent"]').forEach(function(el){var s=getComputedStyle(el);var bg=rgbToHex(s.backgroundColor);var bd=rgbToHex(s.borderColor);if(bg&&bg!=='#ffffff'&&bg!=='#000000')ac[bg]=(ac[bg]||0)+1;if(bd&&bd!=='#000000'&&bd!=='#ffffff')ac[bd]=(ac[bd]||0)+0.5;});
  var cv={};var rs=getComputedStyle(document.documentElement);['--color-primary','--color-secondary','--color-accent','--color-background','--color-foreground','--color-base','--primary','--secondary','--accent'].forEach(function(n){var v=rs.getPropertyValue(n).trim();if(v)cv[n]=v;});
  var entries=Object.entries(ca);var total=entries.reduce(function(a,e){return a+e[1];},0);
  var props=entries.map(function(e){return{hex:e[0],proportion:total>0?e[1]/total:0,area_px:e[1]};}).sort(function(a,b){return b.proportion-a.proportion;}).slice(0,15);
  var ics={has_gold:props.some(function(p){return isGoldTone(p.hex)&&p.proportion>0.03;}),gold_proportion:props.filter(function(p){return isGoldTone(p.hex);}).reduce(function(a,p){return a+p.proportion;},0),has_maroon:props.some(function(p){return isMaroonTone(p.hex)&&p.proportion>0.05;}),maroon_proportion:props.filter(function(p){return isMaroonTone(p.hex);}).reduce(function(a,p){return a+p.proportion;},0),has_saffron:props.some(function(p){return isSaffronTone(p.hex)&&p.proportion>0.03;}),has_deep_green:props.some(function(p){return isDeepGreen(p.hex)&&p.proportion>0.03;})};
  var tce=Object.entries(tc).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  var ace=Object.entries(ac).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  return{proportions:props,text_colors:tce.map(function(e){return{hex:e[0],frequency:e[1]};}),accent_candidates:ace.map(function(e){return{hex:e[0],frequency:e[1]};}),css_custom_properties:cv,indian_color_signals:ics,dominant_bg:props[0]?props[0].hex:'#FFFFFF',is_dark_theme:props[0]?isDarkHex(props[0].hex):false};
}

function extractTypography(){
  var fu={};
  ['h1','h2','h3'].forEach(function(tag){document.querySelectorAll(tag).forEach(function(el){var s=getComputedStyle(el);var f=s.fontFamily.split(',')[0].trim().replace(/['"]/g,'');if(!fu[f])fu[f]={heading:false,body:false,sizes:[],weights:[]};fu[f].heading=true;fu[f].sizes.push(parseFloat(s.fontSize));fu[f].weights.push(s.fontWeight);});});
  document.querySelectorAll('p,li,span,a').forEach(function(el){var s=getComputedStyle(el);var f=s.fontFamily.split(',')[0].trim().replace(/['"]/g,'');if(!fu[f])fu[f]={heading:false,body:false,sizes:[],weights:[]};fu[f].body=true;fu[f].sizes.push(parseFloat(s.fontSize));});
  var gf=Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"]')).map(function(l){var h=l.getAttribute('href');if(!h)return[];var m=h.match(/family=([^&]+)/);return m?m[1].split('|').map(function(f){return decodeURIComponent(f.split(':')[0].replace(/\\+/g,' '));}):[];}).reduce(function(a,b){return a.concat(b);},[]);
  return{font_usage:fu,google_fonts_loaded:gf,heading_font:null,body_font:null,base_font_size_px:null,heading_scale:null};
}

function extractLayout(){
  var ss=Array.from(document.querySelectorAll('.shopify-section')).filter(function(el){ return isVisibleSection(el) && !looksLikePopup(el); });
  if (ss.length < 3) {
    var main = document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#MainContent');
    if (main) {
      var kids = Array.from(main.children).filter(function(el) { return isVisibleSection(el); });
      if (kids.length >= ss.length) ss = kids;
    }
  }
  var md=document.querySelector('meta[name="description"]');
  return{title:document.title||'',metaDescription:md?md.getAttribute('content')||'':'',total_sections:ss.length,totalHeight:document.body.scrollHeight,viewport_height:window.innerHeight,section_heights:ss.map(function(s){return{id:s.id,height:s.getBoundingClientRect().height,viewport_ratio:s.getBoundingClientRect().height/window.innerHeight};}),dark_light_pattern:ss.map(function(s){return isDarkBg(getComputedStyle(s).backgroundColor)?'D':'L';}).join(''),full_width_ratio:ss.length>0?ss.filter(function(s){return s.getBoundingClientRect().width>=window.innerWidth*0.95;}).length/ss.length:0};
}

function extractDesignDNA(){return{sections:extractSections(),palette:extractPalette(),typography:extractTypography(),layout:extractLayout()};}
`;
}
