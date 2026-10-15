import zipfile, re, collections
p='C:/Users/Ian/Desktop/NCU/實驗室/SE_TA - 複製/deliverables/即時線上搶答系統_學生實作需求_含評分標準.pptx'
with zipfile.ZipFile(p) as z:
    xml=z.read('ppt/presentation.xml').decode()
    print(re.search(r'<p:sldSz[^>]+>',xml).group())
    slide_xml=b''.join(z.read(n) for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')).decode()
    print(collections.Counter(re.findall(r'typeface="([^"]+)"',slide_xml)).most_common(10))
