/*
 * / ver1.0.1 / 
 * 2026.10.01
 *
 * 一括更新ボタンでのレコード / 指定フィールドの一括更新
 *
 * 処理の流れ
 * 1. 一括更新ボタンをクリック
 * 2. 更新対象フィールドを選択
 * 3. 選択したフィールドごとに更新値を入力
 * 4. 一覧に表示されているレコードをJSON化
 * 5. kintone REST APIで一括更新
 *
 */
// --------------------------------------
// スピナーを動作させる関数
// --------------------------------------
const showSpinner = () => {
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
const hideSpinner = () => {
  // スピナー停止（非表示）
  document.querySelectorAll('.kintone-spinner').forEach(element => {
    element.style.display = 'none';
  });
};
// ===============================================
// ルックアップによるコピー先フィールドを取得
// ===============================================
function getLookupCopyTargetCodes(fields) {
  const lookupCopyTargetCodes = [];
  fields.forEach(function (field) {
    if (field.lookup && field.lookup.fieldMappings) {
      field.lookup.fieldMappings.forEach(function (mapping) {
        lookupCopyTargetCodes.push(mapping.field);
      });
    }
  });
  //console.log('ルックアップによるコピー先フィールド:',lookupCopyTargetCodes);
  return lookupCopyTargetCodes;
}

// ---------------------------------------------------------
// Mainの処理
// ---------------------------------------------------------
(() => 
{
  'use strict';
  kintone.events.on('app.record.index.show', function (event) 
  {
    // =====================================================
    // 設定
    // =====================================================
    const CONFIG = 
    {
      buttonId: 'btn-update-records',
      modalId: 'bulk-update-modal',
      overlayId: 'bulk-update-overlay'
    };

    // =====================================================
    // 一括更新用のJsonを作成
    // * id:"" //更新用のレコード番号 
    // * record:{}//更新するフィールド名とvalueを格納
    // =====================================================
    function create_update_array(event, selectedFields, updateValues) {
      const updateRecords = [];//最終的に更新するJsonを保管する配列
      // 一覧に表示されているレコードをループ
      event.records.forEach(function (record) {
        const updateRecord = {
          id: record.$id.value,
          record: {}
        };
        // 選択されたフィールドをループ
        selectedFields.forEach(function (field)
        {
          updateRecord.record[field.code] = {
            value: updateValues[field.code]
          };
        });
        // API用配列に追加
        updateRecords.push(updateRecord);
      });
      return updateRecords;
    }


    // =====================================================
    // 一括更新処理
    // =====================================================
    function updateRecords(event) {
      
      // ---------------------------------------------------
      // モーダルの二重生成防止
      // ---------------------------------------------------
      if ($(`#${CONFIG.modalId}`).length > 0) {return;}
      
      // ---------------------------------------------------
      // kintoneのフィールド情報を取得
      // ---------------------------------------------------
      const appId = kintone.app.getId();

      kintone.api(kintone.api.url('/k/v1/app/form/fields', true),'GET',{app: appId},
        // -------------------------------------------------
        // フィールド取得成功時
        // -------------------------------------------------
        (response) => {
          const fields = Object.values(response.properties);
          console.log('取得したフィールド:', fields);
          // =================================================
          // 更新対象として使えないフィールドを除外
          // =================================================
          const targetFields = fields.filter(function (field) {
            if (
              field.type === 'RECORD_NUMBER' ||
              field.type === 'STATUS' ||
              field.type === 'CATEGORY' ||
              field.type === 'CREATOR' ||
              field.type === 'LABEL' ||
              field.type === 'SPACER' ||
              field.type === 'HR' ||
              field.type === 'STATUS_ASSIGNEE' ||
              field.type === 'MODIFIER' ||
              field.type === 'UPDATED_TIME' ||
              field.type === 'CREATED_TIME' ||
              field.type === 'GROUP' ||
              field.type === 'CALC' ||
              field.type === 'FILE' ||
              field.expression //
            ) {
              return false;
            }
            // ===============================================
            // ルックアップ（更新対象対象除外）
            // ===============================================
            if(field.lookup){
              return false;
            }
            // ===============================================
            // ルックアップに使用中のフィールド除外
            // ===============================================
            const lookupCopyTargetCodes = getLookupCopyTargetCodes(fields);
            if(lookupCopyTargetCodes.includes(field.code)){
              return false;
            }
            
            return true;
          });

          // -------------------------------------------------
          // フィールドHTMLを生成
          // -------------------------------------------------

          let fieldHtml = '';

          targetFields.forEach(function (field) {

            fieldHtml += `
              <label style="
                  display: block;
                  padding: 10px;
                  border-bottom: 1px solid #eee;
                  cursor: pointer;
                  box-sizing: border-box;
              ">
              <input
                type="checkbox"
                class="bulk-update-field"
                value="${field.code}"
                data-label="${field.label}"
                data-type="${field.type}"
                data-options='${JSON.stringify(field.options || {})}'
                style="margin-right: 8px;
              ">
                ${field.label}
              </label>
            `;
          });
          // -------------------------------------------------
          // オーバーレイ
          // -------------------------------------------------
          const $overlay = $('<div>', {
            id: CONFIG.overlayId
          }).css({
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.4)',
            'z-index': 9998
          });

          // =================================================
          // モーダル生成
          // =================================================
          const $modal = $('<div>', {
            id: CONFIG.modalId
          }).css({
            padding:'10px 0px',
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '800px',
            'max-width': '90vw',
            height: '800px',
            'max-height': '95vh',
            background: '#fff',
            'border-radius': '8px',
            'box-shadow': '0 5px 30px rgba(0,0,0,0.3)',
            'z-index': 9999,
            overflow: 'hidden',
            'box-sizing': 'border-box'
          });

          // =================================================
          // モーダルHTML
          // =================================================
          $modal.html(
          `<!-- ============================================
                  ヘッダー
            ============================================= -->

            <div style="
              padding: 12px 16px;
              border-bottom: 1px solid #ddd;
              font-size: 20px;
              font-weight: bold;
              box-sizing: border-box;
            ">
              一括更新処理
            </div>
            
            <!-- ============================================
                 メインコンテンツ
            ============================================= -->
            
            <div style="
              padding: 20px;
              height: calc(100% - 130px);
              overflow-y: auto;
              box-sizing: border-box;
            ">
            
            <!-- ==========================================
                 フィールド選択
            =========================================== -->
            <div style="
            margin-bottom: 30px;">
              <div style="margin-bottom: 15px;font-weight: bold;">
                更新するフィールドを選択してください
              </div>
                
              <!-- フィールド選択ドロップダウン -->
              <div id="field-dropdown" style="position: relative;">
                <button type="button" id="field-dropdown-button"
                  style="
                    width: 100%;
                    padding: 12px 16px;
                    background: #fff;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    text-align: left;
                    cursor: pointer;
                    font-size: 14px;
                    box-sizing: border-box;
                  ">
                  フィールドを選択<span style="float: right;">▼</span>
                    
                </button>

                <!-- ======================================
                     フィールド一覧
                ======================================= -->

                <div id="bulk-update-fields"
                  style="
                    display: none;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    width: 100%;
                    max-height: 500px;
                    overflow-y: auto;
                    background: #fff;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    z-index: 10000;
                    box-sizing: border-box;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.15);
                  ">
                  ${fieldHtml}
                </div>
              </div>
            </div>
            <!-- ==========================================
                 更新値入力
            =========================================== -->

              <div style="margin-top: 20px;">
                <div style="margin-bottom: 15px;font-weight: bold;">
                  更新する値を入力してください
                </div>

                <!-- 
                  選択したフィールドの更新値入力欄をここに生成
                -->
                <div id="bulk-update-values">
                
                  <div style="
                    padding: 20px;
                    text-align: center;
                    color: #888;
                    border: 1px dashed #ccc;
                    border-radius: 6px;
                    ">
                  フィールドを選択してください
                  </div>
                  
                </div>
              </div>
            </div>


            <!-- ============================================
                 フッター
            ============================================= -->

            <div style="
                padding: 15px 20px;
                border-top: 1px solid #ddd;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                box-sizing: border-box;
                background: #fff;
            ">
            <!-- キャンセル -->
            <button type="button" id="bulk-update-cancel"
              style="
                padding: 10px 20px;
                border: 1px solid #ccc;
                background: #fff;
                border-radius: 4px;
                cursor: pointer;
              ">
              キャンセル
            </button>


            <!-- 一括更新開始 -->
            <button
              type="button"
              id="bulk-update-start"
              style="
                padding: 10px 20px;
                border: none;
                background: #3498db;
                color: #fff;
                border-radius: 4px;
                cursor: pointer;
              "
            >
            一括更新開始
            </button>

          </div>
        `);

          // =================================================
          // 画面に追加
          // =================================================
          $('body').append($overlay);
          $('body').append($modal);

          // =================================================
          // 選択されたフィールドを管理
          // =================================================
          let selectedFields = [];
          let updateValues = {};
          // =================================================
          // フィールド選択ドロップダウン開閉イベント
          // =================================================
          $modal.on('click','#field-dropdown-button',function () {
            //フォームに開閉設定
            $('#bulk-update-fields').toggle();
            //開閉状態で検索ボタンを管理
            if($('#bulk-update-fields').is(':visible')){
              $('#bulk-update-start').css("background-color","#f0f0f0");
            }
            else{
              $('#bulk-update-start').css("background-color","#3498DB");
            }
          });


          // =================================================
          // フィールド選択
          // =================================================

          $modal.on('change','.bulk-update-field',function () {
              const fieldCode = $(this).val();
              const fieldLabel = $(this).data('label');
              // =============================================
              // チェックされた場合
              // =============================================
              if ($(this).prop('checked')) {
                selectedFields.push({
                  code: fieldCode,
                  label: fieldLabel,
                  type: $(this).data('type'),
                  options: JSON.parse($(this).attr('data-options') || '{}')
                });
                // 更新値を初期化
                updateValues[fieldCode] = '';
              }
              // =============================================
              // チェックを外した場合
              // =============================================

              else {
                // selectedFieldsから削除
                selectedFields =
                  selectedFields.filter(function (field) {
                    return field.code !== fieldCode;
                  });
                // 更新値も削除
                delete updateValues[fieldCode];
              }

              console.log('選択されたフィールド:',selectedFields);
              console.log('更新値:',updateValues);
              // =============================================
              // ドロップダウンボタン表示更新
              // =============================================
              if (selectedFields.length === 0) {
                $('#field-dropdown-button').html(`
                  フィールドを選択
                  <span style="float: right;">▼</span>
                `);

              } else {
                const selectedLabels =
                  selectedFields.map(function (field) {
                    return field.label;
                  });

                $('#field-dropdown-button').html(`
                  ${selectedLabels.join(', ')}
                  <span style="float: right;">▼</span>
                `);
              }
              // =============================================
              // 更新値入力欄を再生成
              // =============================================
              let updateValueHtml = '';
              // 選択されたフィールドをループ
              selectedFields.forEach(function (field) {
                
                //条件分岐で格納
                let inputHtml = "";
                
                //ドロップダウンの場合
                if(field.type === "DROP_DOWN"){
                  //初期値設定
                  let optionsHtml = `<option value= "">選択してください</option>`;
                  // -------------------------------------------------
                  //ドロップダウンに取得したフィールドを表示させる準備
                  // *optionを追加していくことで一覧で表示される
                  // *
                  // -------------------------------------------------
                  Object.keys(field.options || {}).forEach(function (option) {
                    console.log(option);
                    optionsHtml += `<option value=${option}> ${option} </option>`;
                  });
                  
                  inputHtml = `
                    <select
                      class="bulk-update-value"
                      data-field-code="${field.code}"
                      style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-sizing: border-box;
                        font-size: 14px;
                      ">
                      ${optionsHtml}
                    </select>
                  `;
                // ------------------------------------
                // ラジオボタン(RADIO_BUTTON)の場合  
                // ------------------------------------
                }else if(field.type === "RADIO_BUTTON"){  
                  
                  //初期値は空白
                  let radioHtml = "";
                  
                  Object.keys(field.options || {}).forEach(function(option,index){
                    radioHtml += `
                    <label style = "
                      display:block;
                      margin-bottom:8px;
                      cursor:pointer;
                    ">
                      <input 
                        type="radio"
                        name="bulk-update-${field.code}"
                        class="bulk-update-value"
                        data-field-code="${field.code}"
                        value="${option}"
                        ${updateValues[field.code] === option ? 'checked' : ''}
                        style="margin-right: 8px";
                      >
                      ${option}
                    </label>
                    `;
                  });
                  
                  inputHtml = `
                    <div>
                      ${radioHtml}
                    </div>
                    `;
                // ------------------------------    
                // 数値(NUMBER)の場合    
                // ------------------------------
                }else if(field.type === "NUMBER"){
                  inputHtml = `
                    <input 
                      type ="number"
                      class="bulk-update-value"
                      data-field-code="${field.code}"
                      value="${updateValues[field.code] || ''}"
                      placeholder="${field.label}の更新値を入力"
                      step="any"
                      style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-sizing: border-box;
                        font-size: 14px;
                      "
                    >
                  `;

                // 日付フィールドの場合  
                }else if(field.type === "DATE"){
                  
                  inputHtml = `
                    <input
                      type="date"
                      class="bulk-update-value"
                      data-field-code="${field.code}"
                      value="${updateValues[field.code] || ''}"
                      style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-sizing: border-box;
                        font-size: 14px;
                      "
                    >
                  `;                  
                // ===========================================
                // その他
                // ===========================================
                }else{
                  inputHtml = `
                    <input
                      type="text"
                      class="bulk-update-value"
                      data-field-code="${field.code}"
                      value="${updateValues[field.code] || ''}"
                      placeholder="${field.label}の更新値を入力"
                      style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-sizing: border-box;
                        font-size: 14px;
                      "
                    >
                  `;
                }
                
                // --------------------------------------
                // フィールドごとの入力欄
                // --------------------------------------
                updateValueHtml += `
                  <div style="
                      margin-bottom: 15px;
                      padding: 15px;
                      border: 1px solid #ddd;
                      border-radius: 6px;
                      background: #fafafa;
                      box-sizing: border-box;
                  ">
                    <div style="
                        margin-bottom: 8px;
                        font-weight: bold;
                        font-size: 14px;
                    ">
                      ${field.label}
                    </div>
              
                    ${inputHtml}
              
                  </div>
                `;
              
              });
              // -------------------------------
              // 更新値入力欄に反映
              // -------------------------------
              if (selectedFields.length === 0) {
                $('#bulk-update-values').html(`
                  <div style="
                      padding: 20px;
                      text-align: center;
                      color: #888;
                      border: 1px dashed #ccc;
                      border-radius: 6px;
                    "
                  >
                    フィールドを選択してください
                  </div>
                `);
              }else {
                $('#bulk-update-values').html(updateValueHtml);
              }
            }
          );
          
          
          // =================================================
          // 更新値入力
          // =================================================
          $modal.on('input change','.bulk-update-value', function(){
              const fieldCode =$(this).data('field-code');
              const value =$(this).val();
              // 更新値を保存
              updateValues[fieldCode] = value;
              console.log('更新値:',updateValues);
            }
          );
          // =================================================
          // キャンセル
          // =================================================
          $modal.on('click','#bulk-update-cancel', 
            function () {
              $modal.remove();
              $overlay.remove();
            }
          );
          // =================================================
          // 一括更新開始
          // =================================================
          $modal.on('click','#bulk-update-start',
            function () {
              //表示
              showSpinner();
              // =============================================
              // フィールド未選択
              // =============================================
              if (selectedFields.length === 0) {
                alert('更新するフィールドを選択してください。');
                //非表示
                hideSpinner();
                return;
              }
              // =============================================
              // 更新値チェック
              // =============================================

              let hasEmptyValue = false;
              selectedFields.forEach(function (field) {
                const value = updateValues[field.code];
                
                // 空欄チェック
                if (value === undefined || value === '') {
                  hasEmptyValue = true;
                  return;
                }
                
                // 数値フィールドのバリデーション
                if (field.type === 'NUMBER') {
                  if (isNaN(value)) {
                    hasInvalidValue = true;
                  }
                }
              });

              if (hasEmptyValue) {
                alert('更新する値をすべて入力してください。');
                hideSpinner();
                return;
              }
              // =============================================
              // 確認
              // =============================================
              const selectedLabels = selectedFields.map(function (field) {
                return field.label;
              }).join('\n');


              const confirmed = window.confirm(
                `以下のフィールドを一括更新します。\n\n` +
                `${selectedLabels}\n\n` +
                `更新対象件数：${event.records.length}件\n\n` +
                `この内容で更新しますか？`
              );

              if (!confirmed) {
                hideSpinner();
                return;
              }

              // =============================================
              // API用JSONを生成
              // =============================================
              const params_update_json = create_update_array(event,selectedFields,updateValues);
              console.log('一括更新JSON:',params_update_json);
              // =============================================
              // PUTパラメータ
              // =============================================
              const putParams = {
                app: kintone.app.getId(),
                records: params_update_json
              };
              console.log('PUTパラメータ:',putParams);
              // =============================================
              // 一括更新API
              // =============================================
              kintone.api(kintone.api.url('/k/v1/records.json',true),'PUT',putParams,
                // ==========================================
                // 成功
                // ==========================================
                function (resp) {
                  console.log('一括更新成功:', resp);
                  // 1秒待つ
                  setTimeout(function () {
                    hideSpinner();//読み込み停止
                    //カスタマイズしたアラート
                    swal({
                      title: '更新完了',
                      text: `${params_update_json.length}件のレコードを更新しました。`,
                      type: 'success',
                      confirmButtonText: 'OK'
                    }, function () {
                      // モーダルを閉じる
                      $modal.remove();
                      $overlay.remove();
                      // 一覧を再読み込み
                      location.reload();
                    });
                  }, 1000);
                },
                // ==========================================
                // エラー
                // ==========================================
                function (error) {
                  console.error('一括更新エラー:',error);
                  alert('更新に失敗しました。\n\n' +error.message);
                  hideSpinner();
                }
              );
            }
          );
        },

        // ===================================================
        // フィールド取得エラー
        // ===================================================
        (error) => {
          console.error('フィールド取得エラー:',error);
          alert('フィールド情報の取得に失敗しました。');
        }
      );
    }


    // =====================================================
    // 一括更新ボタン
    // =====================================================

    // 二重生成防止
    if ($(`#${CONFIG.buttonId}`).length > 0) {
      return event;
    }
    // =====================================================
    // ボタン生成
    // =====================================================

    const $btn_update_records = $('<button>', {
      id: CONFIG.buttonId,
      class: 'custome-btn-ui',
      html: '<i class="fa-solid fa-arrows-rotate"></i> 一括更新処理'
    }).css({
      'padding': '10px 20px',
      'border': 'none',
      'border-radius': '4px',
      'background-color': '#3498db',
      'color': '#fff',
      'cursor': 'pointer',
      'font-size': '16px',
      'height': '48px',
      'box-sizing': 'border-box',
      'transition': 'background-color 0.2s ease, transform 0.1s ease'
    })
    .on('mouseenter', function () {
      $(this).css('background-color', '#2980b9');
    })
    .on('mouseleave', function () {
      $(this).css('background-color', '#3498db');
    })
    .on('mousedown', function () {
      $(this).css('transform', 'translateY(1px)');
    })
    .on('mouseup', function () {
      $(this).css('transform', 'translateY(0)');
    })
    .on('click', function () {
      updateRecords(event);
    });


    // =====================================================
    // ヘッダーに追加
    // =====================================================
    const headerSpace =kintone.app.getHeaderMenuSpaceElement();
    $(headerSpace).append(
      $btn_update_records
    );
    return event;
  });


})();