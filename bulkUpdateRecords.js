
// --------------------------------------
// スピナーを動作させる関数
// --------------------------------------
function showSpinner(){
  // 要素作成等初期化処理
  if (document.getElementsByClassName('kintone-spinner').length === 0) {
    const spinDiv = document.createElement('div');
    spinDiv.id = 'kintone-spin';
    spinDiv.classList.add('kintone-spinner');
    const spinBgDiv = document.createElement('div');
    spinBgDiv.id = 'kintone-spin-bg';
    spinBgDiv.classList.add('kintone-spinner');
    document.body.appendChild(spinDiv);
    document.body.appendChild(spinBgDiv);

    // スピナー動作に伴うスタイル設定
    spinDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; z-index: 10000; background-color: #fff; padding: 26px; border-radius: 4px;';
    spinBgDiv.style.cssText = 'position: fixed; top: 0px; left: 0px; z-index: 10000; width: 100%; height: 100%; background-color: #000; opacity: 0.5;';
    // スピナーに対するオプション設定
    const opts = {
      color: '#000'
    };
    // スピナーを作動
    new Spinner(opts).spin(document.getElementById('kintone-spin'));
  }
  document.querySelectorAll('.kintone-spinner').forEach(element => {
    element.style.display = 'block';
  });
};
// --------------------------------------
// スピナーを停止させる関数
// --------------------------------------
function hideSpinner(){
  // スピナー停止（非表示）
  document.querySelectorAll('.kintone-spinner').forEach(element => {
    element.style.display = 'none';
  });
};



// =========================================================
// レコード全件取得
//
// レコード全件取得　非同期での処理
// =========================================================
function getAllRecords(appId, query,limit) {
  //非同期処理
  return new Promise(function (resolve, reject) {
    let offset = 0;//オフセット
    const records = [];//取得レコード格納
    function getRecords() {
      let currentQuery = query || '';
      //クエリ条件分岐
      currentQuery +=' limit ' + limit +' offset ' + offset;
      //リクエストパラメーター
      const get_params = {app: appId,query: currentQuery};
      //GET API
      kintone.api(kintone.api.url('/k/v1/records', true),'GET',get_params
      //成功時の処理
      ).then(function (response) {
        //既存のレコードと取得したレコードを結合
        records.push.apply(
          records,
          response.records
        );
        //取得したレコードが500件を下回ったら処理終了
        if (response.records.length < limit) {
          resolve(records);
          return;
        }
        offset += limit;
        getRecords();
      
      // --------------------------------------
      // エラー時の処理
      // --------------------------------------
      }).catch(function (error) {
        reject(error);
      });
    }
    getRecords();
  });
}




// =========================================================
// レコード全件取得
// カーソルAPI + async / await
//
// ・現在の一覧条件を指定して全レコード取得
// ・1回500件ずつ取得
// ・10,000件を超えるレコードにも対応
// =========================================================
async function getAllRecordsByCursor(appId, query = '') {
  const allRecords = [];//最終的に格納する配列
  try {
    // =====================================================
    // 1. カーソル作成
    // =====================================================
    const createCursorParams = {
      app: appId,
      query: query,
      size: 500
    };

    const cursorResponse = await kintone.api(
      kintone.api.url('/k/v1/records/cursor.json', true),
      'POST',
      createCursorParams
    );

    const cursorId = cursorResponse.id;
 
    console.log('カーソル作成:', cursorId);
    console.log('対象件数:', cursorResponse.totalCount);
    // =====================================================
    // 2. カーソルからレコード取得
    // =====================================================
    let hasNext = true;
    while (hasNext) {
      const response = await kintone.api(
        kintone.api.url('/k/v1/records/cursor.json', true),
        'GET',{id: cursorId}
      );
      // -----------------------------------------------
      // 取得したレコードを追加
      // 取得するたびにallRecordsに格納していくことで
      // 1つの配列になる
      // -----------------------------------------------
      allRecords.push(...response.records);
      console.log(`レコード取得: ${allRecords.length} / ${cursorResponse.totalCount}`);
      // -----------------------------------------------
      // 次のデータがあるかどうかチェック
      // -----------------------------------------------
      hasNext = response.next;
    }
    console.log('全レコード取得完了:',allRecords.length);
    return allRecords;
    // -----------------------------------------------
    // エラー時の処理
    // -----------------------------------------------
  } catch (error) {
    console.error('カーソルAPIによるレコード取得エラー:',error);
    throw error;//エラー投げ
  }
}
