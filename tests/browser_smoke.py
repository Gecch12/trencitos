from pathlib import Path
from playwright.sync_api import sync_playwright
base='http://127.0.0.1:3210/'
out=Path('/mnt/data/rail-routes-v06');
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--disable-features=BlockInsecurePrivateNetworkRequests'])
 context=b.new_context(viewport={'width':1460,'height':940},device_scale_factor=1)
 a=context.new_page(); errors=[]
 a.on('pageerror',lambda e:errors.append(str(e)))
 a.goto(base);a.locator('#connection').wait_for();a.wait_for_timeout(500)
 a.screenshot(path=str(out/'preview-lobby-v06.png'),full_page=True)
 a.fill('#nickname','Ana'); a.click('#create');a.locator('#roomcode').wait_for();a.wait_for_timeout(500)
 code=a.locator('#roomcode').inner_text()
 context2=b.new_context(viewport={'width':1460,'height':940});c=context2.new_page();c.on('pageerror',lambda e:errors.append('B:'+str(e)))
 c.goto(base+'?room='+code);c.fill('#nickname','Beto');c.click('#join');c.locator('#roomcode').wait_for();a.wait_for_timeout(450)
 a.click('#start');a.locator('#overlay:not(.hidden)').wait_for()
 a.locator('input.keep').nth(0).check();a.locator('input.keep').nth(1).check();a.click('#keep');
 c.locator('#overlay:not(.hidden)').wait_for(); c.locator('input.keep').nth(0).check();c.locator('input.keep').nth(1).check();c.click('#keep');
 a.locator('#game:not(.hidden)').wait_for();a.wait_for_timeout(800)
 a.screenshot(path=str(out/'preview-game-v06.png'),full_page=True)
 print('room',code,'players',a.locator('.scorebadge').count(),'market',a.locator('#market .traincard').count(),'hand',a.locator('#hand .traincard').count(),'route groups',a.locator('#board .route-group').count())
 a.locator('#market button:not([disabled])').first.click();a.wait_for_timeout(250)
 a.locator('#drawblind').click(); a.wait_for_timeout(400)
 print('current',a.locator('#turntitle').inner_text(),'other',c.locator('#turntitle').inner_text())
 a.locator('#board').hover();a.mouse.wheel(0,-200);a.mouse.wheel(0,200);a.locator('#expandboard').click();a.locator('#expandboard').click()
 mobile=b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 m=mobile.new_page();m.on('pageerror',lambda e:errors.append('mobile:'+str(e)));m.goto(base);m.wait_for_timeout(350);m.screenshot(path=str(out/'preview-mobile-v06.png'),full_page=True)
 print('PAGE ERRORS',errors)
 assert not errors,errors
 assert a.locator('#board .route-group').count()==101
 assert a.locator('#market .traincard').count()>=3
 b.close()
