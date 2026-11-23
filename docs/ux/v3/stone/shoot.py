from playwright.sync_api import sync_playwright
S=[('unsure','#FFB800','side'),('fits','#3DD68C','front'),('nope','#FF4E2E','down'),('fog','#D9D1C2','up')]
with sync_playwright() as p:
  b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);pg=b.new_page(viewport={'width':800,'height':800})
  for n,c,l in S:
    pg.goto(f'http://localhost:8765/index.html?c={c.replace("#","%23")}&look={l}');pg.wait_for_function('window.done===true',timeout=60000);pg.wait_for_timeout(300)
    pg.screenshot(path=f'stone-{n}.png',omit_background=True)
  b.close()
