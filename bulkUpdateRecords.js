/*
 * / ver1.0.4 / プログレスバーなしの読み込み中の離脱制御を行う
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

(() => {
  "use strict";

  // =====================================================
  // 一括更新中フラグ
  // 画面読み込み中に閉じられないようにするため
  // =====================================================
  let isBulkUpdating = false;
  // =====================================================
  // 処理中にページを閉じる・リロードする場合の警告
  // beforeunloadはページを離れようとしているイベント
  // =====================================================
  $(window).on("beforeunload", function (e) {
    //フラグがfalseなら処理を終わる
    if (!isBulkUpdating) return;
    //ブラウザのデフォルトのイベントを実行させない
    e.preventDefault();
    e.returnValue = "";
  });

  // =====================================================
  // 設定
  // =====================================================
  const CONFIG = {
    buttonId: "btn-update-records",
    modalId: "bulk-update-modal",
    overlayId: "bulk-update-overlay",
    updateLimit: 100,
  };
  // ==============================================
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

  // ========================================================
  // Mainの処理
  // ========================================================
  kintone.events.on("app.record.index.show", function (event) {
    function chunkArray(array, size) {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }

    // =====================================================
    // 一括更新用のJsonを作成
    // * id:"" //更新用のレコード番号
    // * record:{}//更新するフィールド名とvalueを格納
    // =====================================================
    function create_update_array(records, selectedFields, updateValues) {
      const updateRecords = []; //最終的に更新するJsonを保管する配列

      // 一覧に表示されているレコードをループ
      records.forEach(function (record) {
        const updateRecord = {
          id: record.$id.value,
          record: {},
        };

        // 選択されたフィールドをループ
        selectedFields.forEach(function (field) {
          updateRecord.record[field.code] = {
            value: updateValues[field.code],
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
      if ($(`#${CONFIG.modalId}`).length > 0) {
        return;
      }

      // ---------------------------------------------------
      // kintoneのフィールド情報を取得
      // ---------------------------------------------------
      const appId = kintone.app.getId();

      kintone.api(
        kintone.api.url("/k/v1/app/form/fields", true),
        "GET",
        { app: appId },

        // -------------------------------------------------
        // フィールド取得成功時
        // -------------------------------------------------
        (response) => {
          const fields = Object.values(response.properties);

          console.log("取得したフィールド:", fields);

          // =================================================
          // 更新対象として使えないフィールドを除外
          // =================================================
          const targetFields = fields.filter(function (field) {
            if (
              field.type === "RECORD_NUMBER" ||
              field.type === "STATUS" ||
              field.type === "CATEGORY" ||
              field.type === "CREATOR" ||
              field.type === "LABEL" ||
              field.type === "SPACER" ||
              field.type === "HR" ||
              field.type === "STATUS_ASSIGNEE" ||
              field.type === "MODIFIER" ||
              field.type === "UPDATED_TIME" ||
              field.type === "CREATED_TIME" ||
              field.type === "GROUP" ||
              field.type === "CALC" ||
              field.type === "FILE" ||
              field.expression
            ) {
              return false;
            }

            // ===============================================
            // ルックアップ（更新対象対象除外）
            // ===============================================
            if (field.lookup) {
              return false;
            }

            // ===============================================
            // ルックアップに使用中のフィールド除外
            // ===============================================
            const lookupCopyTargetCodes = getLookupCopyTargetCodes(fields);

            if (lookupCopyTargetCodes.includes(field.code)) {
              return false;
            }

            return true;
          });

          // -------------------------------------------------
          // フィールドHTMLを生成
          // -------------------------------------------------
          let fieldHtml = `
                <div
                  class="bulk-update-field-option"
                  data-value=""
                  data-label="フィールドを選択してください"
                  data-type=""
                  data-options="{}"
                  style="
                    padding: 11px 14px;
                    cursor: pointer;
                    background: #fff;
                    color: #777;
                    font-size: 13px;
                    line-height: 1.5;
                    border-bottom: 1px solid #f0f0f0;
                    transition: background-color 0.15s ease, color 0.15s ease;
                  "
                >
                  フィールドを選択してください
                </div>
              `;

          // -------------------------------------------------
          // 取得したフィールドを選択肢に格納
          // -------------------------------------------------
          targetFields.forEach(function (field) {
            fieldHtml += `
                  <div
                    class="bulk-update-field-option"
                    data-value="${field.code}"
                    data-label="${field.label}"
                    data-type="${field.type}"
                    data-options='${JSON.stringify(field.options || {})}'
                    style="
                      padding: 11px 14px;
                      cursor: pointer;
                      background: #fff;
                      color: #333;
                      font-size: 13px;
                      line-height: 1.5;
                      border-bottom: 1px solid #f0f0f0;
                      transition: background-color 0.15s ease, color 0.15s ease;
                    "
                  >
                    ${field.label}
                  </div>
                `;
          });

          // -------------------------------------------------
          // オーバーレイ
          // -------------------------------------------------
          const $overlay = $("<div>", {
            id: CONFIG.overlayId,
          }).css({
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(15, 23, 42, 0.42)",
            "z-index": 9998,
            "backdrop-filter": "blur(1px)",
          });

          // =================================================
          // モーダル生成
          // =================================================
          const $modal = $("<div>", {
            id: CONFIG.modalId,
          }).css({
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "720px",
            "max-width": "92vw",
            height: "720px",
            "max-height": "88vh",
            background: "#fff",
            "border-radius": "8px",
            "box-shadow": "0 12px 40px rgba(0, 0, 0, 0.22)",
            "z-index": 9999,
            overflow: "hidden",
            "box-sizing": "border-box",
            "font-family":
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
          });

          // =================================================
          // モーダルHTML
          // =================================================
          $modal.html(
            `
    
                <!-- ============================================
                     ヘッダー
                ============================================= -->
    
                <div style="
                  height: 64px;
                  padding: 0 22px;
                  border-bottom: 1px solid #e8ebef;
                  background: #fff;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  box-sizing: border-box;
                ">
    
                  <div style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                  ">
                    <div style="
                      width: 34px;
                      height: 34px;
                      border-radius: 6px;
                      background: #eef6fc;
                      color: #2980b9;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 15px;
                    ">
                      <i class="fa-solid fa-arrows-rotate"></i>
                    </div>
                    <div>
    
                      <div style="
                        font-size: 16px;
                        font-weight: 700;
                        color: #263238;
                        line-height: 1.4;
                      ">
                        一括更新処理
                      </div>
    
                      <div style="
                        margin-top: 1px;
                        font-size: 11px;
                        color: #8a949e;
                        line-height: 1.4;
                      ">
                        レコードのフィールドを一括更新します
                      </div>
                    </div>
                  </div>
                </div>
    
    
                <!-- ============================================
                     メインコンテンツ
                ============================================= -->
    
                <div style="
                  padding: 24px;
                  height: calc(100% - 126px);
                  overflow-y: auto;
                  box-sizing: border-box;
                  background: #fff;
                ">
    
                  <!-- ==========================================
                       フィールド選択
                  =========================================== -->
    
                  <div style="
                    margin-bottom: 28px;
                  ">
                    <div style="
                      margin-bottom: 9px;
                      display: flex;
                      align-items: center;
                      gap: 7px;
                    ">
                      <span style="
                        width: 3px;
                        height: 15px;
                        background: #3498db;
                        border-radius: 2px;
                        display: inline-block;
                      "></span>
                      <span style="
                        font-size: 13px;
                        font-weight: 700;
                        color: #374151;
                      ">
                        更新するフィールド
                      </span>
                    </div>
                    <div style="
                      margin-bottom: 8px;
                      font-size: 11px;
                      color: #8a949e;
                    ">
                      一括更新するフィールドを選択してください
                    </div>
                    
                    
                    <!-- 
                      ドロップダウンの処理 
                    -->
                    
                    <div id="bulk-update-field-dropdown"
                      style="
                        position: relative;
                        width: 100%;
                      "
                    >
                      <!-- フィールド検索入力 -->
                      <div style="
                        position: relative;
                        width: 100%;
                      ">
                        <i class="fa-solid fa-magnifying-glass"
                          style="
                            position: absolute;
                            left: 14px;
                            top: 50%;
                            transform: translateY(-50%);
                            color: #8a949e;
                            font-size: 13px;
                            pointer-events: none;
                            z-index: 2;
                          "
                        ></i>
                    
                        <input type="text"
                          id="bulk-update-field-search"
                          placeholder="フィールドを検索..."
                          autocomplete="off"
                          style="
                            width: 100%;
                            height: 44px;
                            padding: 0 40px 0 38px;
                            background: #fff;
                            border: 1px solid #d5dbe1;
                            border-radius: 5px;
                            color: #333;
                            font-size: 13px;
                            font-family: inherit;
                            box-sizing: border-box;
                            outline: none;
                            transition:border-color 0.15s ease,box-shadow 0.15s ease;
                          "
                        />
                    
                        <i
                          class="fa-solid fa-chevron-down"
                          id="bulk-update-field-arrow"
                          style="
                            position: absolute;
                            right: 14px;
                            top: 50%;
                            transform: translateY(-50%);
                            color: #7b8794;
                            font-size: 11px;
                            pointer-events: none;
                            transition: transform 0.2s ease;
                          "
                        ></i>
                      </div>
                    
                      <!-- 選択中のフィールド -->
                      <div
                        id="bulk-update-field-selected"
                        style="
                          display: none;
                          margin-top: 6px;
                          padding: 7px 10px;
                          background: #f0f7fc;
                          border: 1px solid #d8eaf7;
                          border-radius: 4px;
                          color: #2980b9;
                          font-size: 12px;
                        "
                      >
                        <i
                          class="fa-solid fa-check"
                          style="
                            margin-right: 5px;
                            font-size: 11px;
                          "
                        ></i>
                        <span id="bulk-update-field-text"></span>
                      </div>
                    
                      <!-- フィールド一覧 -->
                      <div
                        id="bulk-update-field-options"
                        style="
                          display: none;
                          position: absolute;
                          top: calc(100% + 4px);
                          left: 0;
                          width: 100%;
                          max-height: 300px;
                          overflow-y: auto;
                          background: #fff;
                          border: 1px solid #d5dbe1;
                          border-radius: 5px;
                          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
                          z-index: 9999;
                          box-sizing: border-box;
                          padding: 4px 0;
                        "
                      >
                        ${fieldHtml}
                    
                        <!------------------------------ 
                          検索結果0件の場合の表示
                        ------------------------------->
                        <div
                          id="bulk-update-field-no-result"
                          style="
                            display: none;
                            padding: 18px 14px;
                            text-align: center;
                            color: #9aa3ad;
                            font-size: 12px;
                          "
                        >
                          <i
                            class="fa-solid fa-magnifying-glass"
                            style="
                              margin-right: 5px;
                              color: #b5bdc6;
                            "
                          ></i>
                          該当するフィールドがありません
                        </div>
                      </div>
                    </div>
                  </div>
    
    
                  <!-- ==========================================
                       更新値入力
                  =========================================== -->
    
                  <div style="
                    margin-top: 4px;
                  ">
                    <div style="
                      margin-bottom: 9px;
                      display: flex;
                      align-items: center;
                      gap: 7px;
                    ">
                      <span style="
                        width: 3px;
                        height: 15px;
                        background: #3498db;
                        border-radius: 2px;
                        display: inline-block;
                      "></span>
                      <span style="
                        font-size: 13px;
                        font-weight: 700;
                        color: #374151;
                      ">
                        更新する値
                      </span>
                    </div>
    
    
                    <div style="
                      margin-bottom: 8px;
                      font-size: 11px;
                      color: #8a949e;
                    ">
                      選択したフィールドに設定する値を入力してください
                    </div>
    
    
                    <!-- 選択したフィールドの更新値入力欄 -->
    
                    <div id="bulk-update-values">
    
                      <div style="
                        padding: 28px 20px;
                        text-align: center;
                        color: #9aa3ad;
                        border: 1px dashed #d5dbe1;
                        border-radius: 6px;
                        background: #fafbfc;
                        font-size: 12px;
                      ">
    
                        <i
                          class="fa-regular fa-hand-pointer"
                          style="
                            margin-right: 5px;
                            color: #aeb7c1;
                          "
                        ></i>
    
                        フィールドを選択してください
                      </div>
                    </div>
                  </div>
                </div>
    
    
                <!-- ============================================
                     フッター
                ============================================= -->
    
                <div style="
                  height: 62px;
                  padding: 0 22px;
                  border-top: 1px solid #e8ebef;
                  display: flex;
                  justify-content: flex-end;
                  align-items: center;
                  gap: 8px;
                  box-sizing: border-box;
                  background: #fff;
                ">
    
                  <!-- キャンセル -->
    
                  <button
                    type="button"
                    id="bulk-update-cancel"
                    style="
                      height: 36px;
                      padding: 0 16px;
                      border: 1px solid #d1d6dc;
                      background: #fff;
                      color: #59636e;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 12px;
                      font-family: inherit;
                      transition:
                        background-color 0.15s ease,
                        border-color 0.15s ease;
                    "
                  >
                    キャンセル
                  </button>
                  <!-- 一括更新開始 -->
    
                  <button
                    type="button"
                    id="bulk-update-start"
                    style="
                      height: 36px;
                      padding: 0 18px;
                      border: 1px solid #3498db;
                      background: #3498db;
                      color: #fff;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 12px;
                      font-weight: 600;
                      font-family: inherit;
                      transition:
                        background-color 0.15s ease,
                        border-color 0.15s ease,
                        transform 0.1s ease;
                    "
                  >
                    <i
                      class="fa-solid fa-arrows-rotate"
                      style="margin-right: 5px;"
                    ></i>
                    一括更新開始
                  </button>
                </div>
              `
          );

          // =================================================
          // 画面に追加
          // =================================================
          $("body").append($overlay);
          $("body").append($modal);

          // =================================================
          // 選択されたフィールドを管理
          // =================================================
          let selectedFields = [];
          let updateValues = {};

          // =================================================
          // フィールド検索・選択
          // =================================================

          // -------------------------------------------------
          // フィールド検索欄をクリック /フォーカス
          // -------------------------------------------------
          $modal.on("focus", "#bulk-update-field-search", function () {
            const $search = $(this); //自分
            const $options = $("#bulk-update-field-options");
            const $arrow = $("#bulk-update-field-arrow");
            // 候補を表示
            $options.show();
            //フォーカス時デザイン
            $search.css({
              "border-color": "#3498db",
              "box-shadow": "0 0 0 2px rgba(52, 152, 219, 0.12)",
            });
            //下向きの矢印の位置
            $arrow.css({
              transform: "translateY(-50%) rotate(180deg)",
            });
            //検索結果を更新する
            filterFieldOptions($search.val());
          });

          // -------------------------------------------------
          // フィールド検索
          // -------------------------------------------------
          $modal.on("input", "#bulk-update-field-search", function () {
            const keyword = $(this).val();

            const $options = $("#bulk-update-field-options");
            const $arrow = $("#bulk-update-field-arrow");

            // 候補を表示
            $options.show();

            $arrow.css({
              transform: "translateY(-50%) rotate(180deg)",
            });

            filterFieldOptions(keyword);
          });

          // -------------------------------------------------
          // フィールド検索処理関数（キーワード）
          // -------------------------------------------------
          function filterFieldOptions(keyword) {
            //検索する文字を加工する（大文字を省き検索しやすくする）
            const normalizedKeyword = String(keyword || "")
              .trim()
              .toLowerCase();

            const $options = $("#bulk-update-field-options");
            const $fieldOptions = $options.find(".bulk-update-field-option");
            const $noResult = $("#bulk-update-field-no-result");
            //検索にヒットした件数を格納する
            let matchCount = 0;
            //
            $fieldOptions.each(function () {
              const $option = $(this);
              const label = String(
                $option.attr("data-label") || ""
              ).toLowerCase();

              // 「フィールドを選択してください」は
              // 検索対象から除外
              const fieldCode = $option.attr("data-value");
              //コードではない場合はオートコンプリートを出さない
              if (!fieldCode) {
                $option.hide();
                return;
              }

              // -------------------------------------------------
              // 検索文字が空
              // -------------------------------------------------
              if (!normalizedKeyword) {
                $option.show();
                matchCount++;
                return;
              }
              // -------------------------------------------------
              // フィールド名に検索文字が含まれている
              // -------------------------------------------------
              if (label.includes(normalizedKeyword)) {
                $option.show();
                matchCount++;
              } else {
                $option.hide();
              }
            });

            // -------------------------------------------------
            // 0件の場合
            // -------------------------------------------------
            if (matchCount === 0) {
              $noResult.show();
            } else {
              $noResult.hide();
            }
          }

          // =================================================
          // フィールド選択
          //
          // =================================================
          $modal.on("click", ".bulk-update-field-option", function (e) {
            e.stopPropagation(); //親要素のイベントを実行させない

            const $option = $(this);
            // 選択したフィールドコード
            const fieldCode = $option.attr("data-value");

            // =================================================
            // 「フィールドを選択してください」
            // =================================================
            if (!fieldCode) {
              selectedFields = [];
              updateValues = {};

              // 検索欄を空白にして入力例を表示
              $("#bulk-update-field-search")
                .val("")
                .attr("placeholder", "フィールドを検索...");

              // 選択中のフィールドを隠す
              $("bulk-update-field-selected").hide();
              //
              $("bulk-update-field-text").hide();

              $("#bulk-update-values").html(`
                      <div style="
                        padding: 28px 20px;
                        text-align: center;
                        color: #9aa3ad;
                        border: 1px dashed #d5dbe1;
                        border-radius: 6px;
                        background: #fafbfc;
                        font-size: 12px;
                      ">
                        <i
                          class="fa-regular fa-hand-pointer"
                          style="
                            margin-right: 5px;
                            color: #aeb7c1;
                          "
                        ></i>
                        フィールドを選択してください
                      </div>
                    `);

              $("#bulk-update-field-options").hide();

              $("#bulk-update-field-search").css({
                "border-color": "#d5dbe1",
                "box-shadow": "none",
              });

              $("#bulk-update-field-arrow").css({
                transform: "translateY(-50%)",
              });

              return;
            }

            // =================================================
            // 確認のためにコンソールさせる
            // 選択したフィールド情報
            // =================================================
            const selectedField = {
              code: fieldCode,
              label: $option.attr("data-label"),
              type: $option.attr("data-type"),
              options: JSON.parse($option.attr("data-options") || "{}"),
            };

            console.log("選択したフィールド:", selectedField);

            // =================================================
            // 1フィールドだけ選択
            // =================================================
            selectedFields = [selectedField];

            // =================================================
            // 更新値を初期化
            // =================================================
            updateValues = {};
            updateValues[fieldCode] = "";

            // -------------------------------------------------
            // 検索欄に選択したフィールド名を表示
            // -------------------------------------------------
            $("#bulk-update-field-search").val(selectedField.label).css({
              "border-color": "#d5dbe1",
              "box-shadow": "none",
            });

            // =================================================
            // 選択中のフィールド名を表示
            // =================================================

            $("bulk-update-field-selected").show();

            $("#bulk-update-field-text").text(selectedField.label);

            // =================================================
            // 選択状態をリセット
            // =================================================
            $(".bulk-update-field-option").css({
              background: "#fff",
              color: "#333",
            });

            // =================================================
            // 選択した項目をハイライト
            // =================================================
            $option.css({
              background: "#f0f7fc",
              color: "#2980b9",
            });

            // =================================================
            // ドロップダウンを閉じる
            // =================================================
            $("#bulk-update-field-options").hide();

            $("#bulk-update-field-arrow").css({
              transform: "translateY(-50%)",
            });

            // =================================================
            // フィールド検索：外側クリックで閉じる
            // =================================================
            $modal.on("click", function (e) {
              if (!$(e.target).closest("#bulk-update-field-dropdown").length) {
                $("#bulk-update-field-options").hide();

                $("#bulk-update-field-search").css({
                  "border-color": "#d5dbe1",
                  "box-shadow": "none",
                });

                $("#bulk-update-field-arrow").css({
                  transform: "translateY(-50%)",
                });
              }
            });

            // =================================================
            // 更新値入力欄
            // =================================================
            let inputHtml = "";

            // =================================================
            // ドロップダウン型のフィールドの場合
            // =================================================
            if (selectedField.type === "DROP_DOWN") {
              // -----------------------------------------------
              // 選択肢HTML
              // -----------------------------------------------
              let optionHtml = `
                  <div
                    class="bulk-update-value-option"
                    data-value=""
                    data-label="選択してください"
                    style="
                      padding: 10px 13px;
                      cursor: pointer;
                      background: #fff;
                      color: #777;
                      font-size: 13px;
                      border-bottom: 1px solid #f0f0f0;
                      transition:
                        background-color 0.15s ease,
                        color 0.15s ease;
                    "
                  >
                    選択してください
                  </div>
                `;

              Object.keys(selectedField.options || {}).forEach(function (key) {
                optionHtml += `
                    <div
                      class="bulk-update-value-option"
                      data-value="${key}"
                      data-label="${key}"
                      style="
                        padding: 10px 13px;
                        cursor: pointer;
                        background: #fff;
                        color: #333;
                        font-size: 13px;
                        border-bottom: 1px solid #f0f0f0;
                        transition:
                          background-color 0.15s ease,
                          color 0.15s ease;
                      "
                    >
                      ${key}
                    </div>
                  `;
              });

              // -----------------------------------------------
              // ドロップダウン本体
              // -----------------------------------------------
              inputHtml = `
                  <div
                    class="bulk-update-value-dropdown"
                    data-field-code="${selectedField.code}"
                    style="
                      position: relative;
                      width: 100%;
                    "
                  >
  
                    <!-- 選択中の値 -->
  
                    <div
                      class="bulk-update-value-button"
                      style="
                        width: 100%;
                        height: 44px;
                        padding: 0 42px 0 13px;
                        background: #fff;
                        border: 1px solid #d5dbe1;
                        border-radius: 5px;
                        color: #777;
                        font-size: 13px;
                        font-family: inherit;
                        cursor: pointer;
                        box-sizing: border-box;
                        display: flex;
                        align-items: center;
                        position: relative;
                        transition:
                          border-color 0.15s ease,
                          box-shadow 0.15s ease;
                      "
                    >
  
                      <span class="bulk-update-value-text">
                        選択してください
                      </span>
  
                      <i
                        class="fa-solid fa-chevron-down bulk-update-value-arrow"
                        style="
                          position: absolute;
                          right: 14px;
                          top: 50%;
                          transform: translateY(-50%);
                          color: #7b8794;
                          font-size: 11px;
                          pointer-events: none;
                          transition: transform 0.2s ease;
                        "
                      ></i>
  
                    </div>
  
  
                    <!-- 選択肢 -->
  
                    <div
                      class="bulk-update-value-options"
                      style="
                        display: none;
                        position: absolute;
                        top: calc(100% + 4px);
                        left: 0;
                        width: 100%;
                        max-height: 300px;
                        overflow-y: auto;
                        background: #fff;
                        border: 1px solid #d5dbe1;
                        border-radius: 5px;
                        box-shadow:
                          0 8px 20px
                          rgba(0, 0, 0, 0.12);
                        z-index: 10000;
                        box-sizing: border-box;
                        padding: 4px 0;
                      "
                    >
  
                      ${optionHtml}
  
                    </div>
  
                  </div>
                `;
            }

            // =================================================
            // ラジオボタン型のフィールドの場合
            // =================================================
            else if (selectedField.type === "RADIO_BUTTON") {
              inputHtml = `
                  <div style="
                    display: flex;
                    flex-direction: column;
                    gap: 7px;
                    padding: 2px 0;
                  ">
                `;

              Object.keys(selectedField.options || {}).forEach(function (key) {
                inputHtml += `
                    <label style="
                      min-height: 38px;
                      padding: 0 12px;
                      display: flex;
                      align-items: center;
                      gap: 9px;
                      cursor: pointer;
                      font-size: 13px;
                      color: #374151;
                      background: #fff;
                      border: 1px solid #e1e5ea;
                      border-radius: 5px;
                      box-sizing: border-box;
                    ">
  
                      <input
                        type="radio"
                        class="bulk-update-value"
                        name="bulk-update-${selectedField.code}"
                        data-field-code="${selectedField.code}"
                        value="${key}"
                      >
  
                      ${key}
  
                    </label>
                  `;
              });

              inputHtml += `
                      </div>
                    `;
            }

            // =================================================
            // 数値型フィールドの場合
            // =================================================
            else if (selectedField.type === "NUMBER") {
              inputHtml = `
                  <input
                    type="number"
                    class="bulk-update-value"
                    data-field-code="${selectedField.code}"
                    placeholder="例) 12345678"
                    style="
                      width: 100%;
                      height: 44px;
                      padding: 0 13px;
                      border: 1px solid #d5dbe1;
                      border-radius: 5px;
                      font-size: 13px;
                      font-family: inherit;
                      color: #333;
                      background: #fff;
                      box-sizing: border-box;
                      outline: none;
                    "
                  >
                `;
            }

            // =================================================
            // 日付型フィールドの場合
            // =================================================
            else if (selectedField.type === "DATE") {
              inputHtml = `
                  <input
                    type="date"
                    class="bulk-update-value"
                    data-field-code="${selectedField.code}"
                    style="
                      width: 100%;
                      height: 44px;
                      padding: 0 13px;
                      border: 1px solid #d5dbe1;
                      border-radius: 5px;
                      font-size: 13px;
                      font-family: inherit;
                      color: #333;
                      background: #fff;
                      box-sizing: border-box;
                      outline: none;
                    "
                  >
                `;
            }

            // =================================================
            // その他
            // =================================================
            else {
              inputHtml = `
                  <input
                    type="text"
                    class="bulk-update-value"
                    data-field-code="${selectedField.code}"
                    placeholder="例) ここに入力"
                    style="
                      width: 100%;
                      height: 44px;
                      padding: 0 13px;
                      border: 1px solid #d5dbe1;
                      border-radius: 5px;
                      font-size: 13px;
                      font-family: inherit;
                      color: #333;
                      background: #fff;
                      box-sizing: border-box;
                      outline: none;
                    "
                  >
                `;
            }

            // =================================================
            // 更新値エリアに表示
            // =================================================
            $("#bulk-update-values").html(`
                <div style="
                  padding: 17px;
                  border: 1px solid #e1e5ea;
                  border-radius: 6px;
                  background: #fafbfc;
                  box-sizing: border-box;
                ">
                  <div style="
                    margin-bottom: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                  ">
  
                    <div style="
                      font-weight: 600;
                      font-size: 13px;
                      color: #374151;
                    ">
                      ${selectedField.label}
                    </div>
  
                    <div style="
                      font-size: 10px;
                      color: #9aa3ad;
                      padding: 3px 7px;
                      background: #fff;
                      border: 1px solid #e5e7eb;
                      border-radius: 3px;
                    ">
                      ${selectedField.type}
                    </div>
  
                  </div>
  
                  ${inputHtml}
  
                </div>
              `);
          });

          //-------------------------------------------------------------------------ここまで

          // =================================================
          // 更新値ドロップダウン
          // 開閉処理
          // =================================================
          $modal.on("click", ".bulk-update-value-button", function (e) {
            e.stopPropagation();
            const $button = $(this);
            const $dropdown = $button.closest(".bulk-update-value-dropdown");
            const $options = $dropdown.find(".bulk-update-value-options");
            const $arrow = $dropdown.find(".bulk-update-value-arrow");
            // =================================================
            // 他の更新値ドロップダウンを閉じる
            // =================================================
            $modal.find(".bulk-update-value-options").not($options).hide();
            $modal.find(".bulk-update-value-button").not($button).css({
              "border-color": "#d5dbe1",
              "box-shadow": "none",
            });
            $modal.find(".bulk-update-value-arrow").not($arrow).css({
              transform: "translateY(-50%)",
            });

            // =================================================
            // 開閉
            // =================================================
            if ($options.is(":visible")) {
              // 閉じる
              $options.hide();
              $button.css({
                "border-color": "#d5dbe1",
                "box-shadow": "none",
              });
              $arrow.css({
                transform: "translateY(-50%)",
              });
            } else {
              // 開く
              $options.show();
              $button.css({
                "border-color": "#3498db",
                "box-shadow": "0 0 0 2px rgba(52, 152, 219, 0.12)",
              });
              $arrow.css({
                transform: "translateY(-50%) rotate(180deg)",
              });
            }
          });

          // =================================================
          // 更新値ドロップダウン
          // 選択肢をクリックしたとき
          // =================================================
          $modal.on("click", ".bulk-update-value-option", function (e) {
            //親要素のイベントをストップさせる
            e.stopPropagation();
            const $option = $(this);
            // 選択した値
            const value = $option.attr("data-value");

            // 表示するラベル
            const label = $option.attr("data-label");

            // 対象のドロップダウン
            const $dropdown = $option.closest(".bulk-update-value-dropdown");
            // フィールドコード
            const fieldCode = $dropdown.attr("data-field-code");
            // =================================================
            // 更新値を保存
            // =================================================
            updateValues[fieldCode] = value;
            console.log("更新値ドロップダウン選択:", fieldCode, value);
            // =================================================
            // 選択した値を表示
            // =================================================
            $dropdown
              .find(".bulk-update-value-text")
              .text(label || "選択してください")
              .css("color", value === "" ? "#777" : "#333");

            // =================================================
            // 選択状態をリセット
            // =================================================
            $dropdown
              .find(".bulk-update-value-option")
              .removeClass("selected")
              .css({
                background: "#fff",
                color: "#333",
              });

            // =================================================
            // 選択した項目をハイライト
            // =================================================
            $option.addClass("selected").css({
              background: "#f0f7fc",
              color: "#2980b9",
            });

            // =================================================
            // ドロップダウンを閉じる
            // =================================================
            $dropdown.find(".bulk-update-value-options").hide();

            // =================================================
            // ボタンの状態を戻す
            // =================================================
            $dropdown.find(".bulk-update-value-button").css({
              "border-color": "#d5dbe1",
              "box-shadow": "none",
            });

            // =================================================
            // 矢印を戻す
            // =================================================
            $dropdown.find(".bulk-update-value-arrow").css({
              transform: "translateY(-50%)",
            });
          });

          // =================================================
          // 更新値ドロップダウン
          // 選択肢ホバー
          // =================================================
          $modal.on("mouseenter", ".bulk-update-value-option", function () {
            $(this).css({
              background: "#f0f7fc",
              color: "#2980b9",
            });
          });

          $modal.on("mouseleave", ".bulk-update-value-option", function () {
            // 選択中の場合
            if ($(this).hasClass("selected")) {
              $(this).css({
                background: "#f0f7fc",
                color: "#2980b9",
              });
              return;
            }

            // 通常状態に戻す
            $(this).css({
              background: "#fff",
              color: "#333",
            });
          });

          // =================================================
          // 更新値ドロップダウン
          // 外側クリックで閉じる
          // =================================================
          $modal.on("click", function (e) {
            if (!$(e.target).closest(".bulk-update-value-dropdown").length) {
              $modal.find(".bulk-update-value-options").hide();

              //ボタンcss
              $modal.find(".bulk-update-value-button").css({
                "border-color": "#d5dbe1",
                "box-shadow": "none",
              });

              //矢印css
              $modal.find(".bulk-update-value-arrow").css({
                transform: "translateY(-50%)",
              });
            }
          });

          // =================================================
          // 更新値入力
          // =================================================
          $modal.on("input change", ".bulk-update-value", function () {
            const fieldCode = $(this).data("field-code");
            const value = $(this).val();
            // 更新値を保存
            updateValues[fieldCode] = value;
            console.log("更新値:", updateValues);
          });

          // =================================================
          // キャンセル
          // =================================================
          $modal.on("click", "#bulk-update-cancel", function () {
            $modal.remove();
            $overlay.remove();
          });
          // =================================================
          // 一括更新開始
          // =================================================
          $modal.on("click", "#bulk-update-start", function () {
            // =============================================
            // フィールド未選択
            // =============================================
            if (selectedFields.length === 0) {
              alert("更新するフィールドを選択してください。");
              //非表示
              hideSpinner();
              return;
            }

            // =============================================
            // 更新値チェック
            // =============================================
            let hasEmptyValue = false;
            let hasInvalidValue = false;

            selectedFields.forEach(function (field) {
              const value = updateValues[field.code];
              // 空欄チェック
              if (value === undefined || value === "") {
                hasEmptyValue = true;
                return;
              }

              // 数値フィールドのバリデーション
              if (field.type === "NUMBER") {
                if (isNaN(value)) {
                  hasInvalidValue = true;
                }
              }
            });

            // ---------------------------------------------
            // 更新する場合の値が空白の場合にアラート
            // ---------------------------------------------
            if (hasEmptyValue) {
              alert("更新する値をすべて入力してください。");
              hideSpinner();
              return;
            }

            // ---------------------------------------------
            // 更新する場合数値が空白の場合にアラート
            // ---------------------------------------------
            if (hasInvalidValue) {
              alert("数値フィールドには数値を入力してください。");
              hideSpinner();
              return;
            }

            // ---------------------------------------------
            // 更新するフィールドを抽出（改行あり）
            // ---------------------------------------------
            const selectedLabels = selectedFields
              .map(function (field) {
                return field.label;
              })
              .join("\n");

            // ---------------------------------------------
            // HTML特殊文字をエスケープ
            // ---------------------------------------------
            function escapeHtml(value) {
              return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
            }

            // ---------------------------------------------
            // 更新内容のテーブルを生成
            // ---------------------------------------------
            let updateTableHtml = "";

            selectedFields.forEach(function (field) {
              const value = updateValues[field.code];
              updateTableHtml += `
                  <tr>
  
                    <td style="
                      padding: 12px 14px;
                      border-bottom: 1px solid #e5e7eb;
                      color: #555;
                      font-weight: 600;
                      width: 42%;
                      background: #f8f9fa;
                      text-align: left;
                    ">
                      ${escapeHtml(field.label)}
                    </td>
  
                    <td style="
                      padding: 12px 14px;
                      border-bottom: 1px solid #e5e7eb;
                      color: #222;
                      text-align: left;
                      word-break: break-word;
                    ">
                      ${escapeHtml(value)}
                    </td>
  
                  </tr>
                `;
            });

            // ======================================
            // 確認画面を実装
            // ======================================
            swal(
              {
                title: "一括更新の確認",
                text: `
                    <div style="
                      text-align: left;
                      font-size: 14px;
                      color: #333;
                    ">
                      <!-- 説明 -->
                      <div style="
                        margin-bottom: 20px;
                        color: #555;
                        line-height: 1.6;
                      ">
                        一括更新を実行すると、
                        現在の一覧条件に一致するレコードを取得し、
                        選択したフィールドを一括更新します。
                      </div>
              
                      <!-- 更新対象 -->
              
                      <div style="margin-bottom: 20px;">
                        <div style="
                          margin-bottom: 7px;
                          font-size: 13px;
                          font-weight: bold;
                          color: #666;
                        ">
                          更新対象
                        </div>
              
                        <div style="
                          padding: 12px 14px;
                          background: #f5f7fa;
                          border: 1px solid #e1e5ea;
                          border-radius: 4px;
                          font-size: 13px;
                          color: #555;
                          line-height: 1.6;
                        ">
                          現在の一覧条件に一致するレコード
                        </div>
                      </div>
              
                      <!-- 更新内容 -->
                      <div style="margin-bottom: 20px;">
                        <div style="
                          margin-bottom: 7px;
                          font-size: 13px;
                          font-weight: bold;
                          color: #666;
                        ">
                          更新内容
                        </div>
              
                        <table style="
                          width: 100%;
                          border-collapse: collapse;
                          border: 1px solid #e1e5ea;
                          border-radius: 4px;
                          overflow: hidden;
                          font-size: 13px;
                        ">
                          <thead>
                            <tr>
                              <th style="
                                padding: 10px 14px;
                                background: #f1f3f5;
                                border-bottom: 1px solid #dfe3e8;
                                color: #555;
                                text-align: left;
                                width: 42%;
                              ">
                                フィールド
                              </th>
              
                              <th style="
                                padding: 10px 14px;
                                background: #f1f3f5;
                                border-bottom: 1px solid #dfe3e8;
                                color: #555;
                                text-align: left;
                              ">
                                更新後の値
                              </th>
              
                            </tr>
                          </thead>
              
                          <tbody>
                            ${updateTableHtml}
                          </tbody>
              
                        </table>
              
                      </div>
              
                      <!-- 注意事項 -->
                      <div style="
                        padding: 12px 14px;
                        background: #fff8e6;
                        border: 1px solid #f2d48a;
                        border-radius: 4px;
                        color: #765b00;
                        font-size: 13px;
                        line-height: 1.6;
                      ">
                        <strong>確認してください</strong><br>
                        「一括更新する」を押すと、
                        対象レコードを取得して更新処理を開始します。
                      </div>
              
                    </div>
                  `,

                html: true,
                type: "warning",
                showCancelButton: true,
                confirmButtonText: "対象件数を確認",
                cancelButtonText: "キャンセル",
                confirmButtonColor: "#3498db",
                closeOnConfirm: true,
              },

              // =================================================
              // Confirm
              // =================================================
              async function (isConfirm) {
                if (!isConfirm) {
                  return;
                }
                try {
                  // =================================================
                  // ローディング開始
                  // =================================================
                  showSpinner();

                  // =================================================
                  // 現在の一覧条件を取得
                  // =================================================
                  const appId = kintone.app.getId();
                  const query = kintone.app.getQueryCondition() || "";
                  console.log("更新対象Query:", query);

                  // =================================================
                  // Cursor APIで全件取得
                  // ※ここで1回だけ取得する
                  // =================================================
                  console.log("Cursor APIでレコード取得開始");

                  const records = await getAllRecordsByCursor(appId, query);

                  console.log("Cursor API取得件数:", records.length);

                  // =================================================
                  // ローディング終了
                  // =================================================
                  hideSpinner();

                  // =================================================
                  // 対象0件
                  // =================================================
                  if (records.length === 0) {
                    swal({
                      title: "更新対象なし",
                      text: "現在の一覧条件に一致するレコードがありません。",
                      type: "info",
                      confirmButtonText: "OK",
                    });
                    return;
                  }

                  // =================================================
                  // 実際の対象件数を表示
                  // =================================================
                  const targetCount = records.length;
                  // =================================================
                  // 対象件数確認
                  // =================================================
                  swal(
                    {
                      title: "更新対象件数の確認",

                      text: `
                          <div style="
                            text-align: left;
                            font-size: 14px;
                            color: #333;
                          ">
              
                            <div style="
                              margin-bottom: 18px;
                              color: #555;
                              line-height: 1.6;
                            ">
                              現在の一覧条件から取得した
                              実際の更新対象件数は以下のとおりです。
                            </div>
              
              
                            <!-- 対象件数 -->
              
                            <div style="margin-bottom: 20px;">
                              <div style="
                                margin-bottom: 7px;
                                font-size: 13px;
                                font-weight: bold;
                                color: #666;
                              ">
                                更新対象件数
                              </div>
                              <div style="
                                padding: 18px 14px;
                                background: #f5f7fa;
                                border: 1px solid #dfe3e8;
                                border-radius: 5px;
                                text-align: center;
                              ">
                                <span style="
                                  font-size: 28px;
                                  font-weight: 700;
                                  color: #2980b9;
                                ">
                                  ${targetCount.toLocaleString()}
                                </span>
                                <span style="
                                  margin-left: 5px;
                                  font-size: 13px;
                                  color: #555;
                                ">
                                  件
                                </span>
                              </div>
                            </div>
              
                            <!-- 更新内容 -->
              
                            <div style="margin-bottom: 20px;">
                              <div style="
                                margin-bottom: 7px;
                                font-size: 13px;
                                font-weight: bold;
                                color: #666;
                              ">
                                更新内容
                              </div>
              
                              <table style="
                                width: 100%;
                                border-collapse: collapse;
                                border: 1px solid #e1e5ea;
                                font-size: 13px;
                              ">
                                <thead>
                                  <tr>
                                    <th style="
                                      padding: 10px 14px;
                                      background: #f1f3f5;
                                      border-bottom: 1px solid #dfe3e8;
                                      color: #555;
                                      text-align: left;
                                      width: 42%;
                                    ">
                                      フィールド
                                    </th>
              
                                    <th style="
                                      padding: 10px 14px;
                                      background: #f1f3f5;
                                      border-bottom: 1px solid #dfe3e8;
                                      color: #555;
                                      text-align: left;
                                    ">
                                      更新後の値
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${updateTableHtml}
                                </tbody>
                              </table>
                            </div>
              
                            <!-- 注意事項 -->
              
                            <div style="
                              padding: 12px 14px;
                              background: #fff8e6;
                              border: 1px solid #f2d48a;
                              border-radius: 4px;
                              color: #765b00;
                              font-size: 13px;
                              line-height: 1.6;
                            ">
                              <strong>最終確認</strong><br>
                              ${targetCount.toLocaleString()}件のレコードを
                              一括更新します。
                            </div>
              
                          </div>
                        `,
                      html: true,
                      type: "warning",
                      showCancelButton: true,
                      confirmButtonText: "一括更新する",
                      cancelButtonText: "キャンセル",
                      confirmButtonColor: "#3498db",
                      closeOnConfirm: true,
                    },

                    // =================================================
                    // 最終Confirm
                    // ここで一括更新ボタンを押すと一括更新処理が走る
                    // =================================================
                    async function (isFinalConfirm) {
                      // -------------------------------------------------
                      // キャンセル
                      // -------------------------------------------------
                      if (!isFinalConfirm) {
                        return;
                      }
                      try {
                        // =================================================
                        // 一括更新中にする（true）
                        // =================================================
                        isBulkUpdating = true;
                        // =================================================
                        // ローディング開始
                        // =================================================
                        showSpinner();
                        // =================================================
                        // 取得済みrecordsから更新JSONを作成
                        //
                        // ★重要
                        // APIをもう一度呼ばない
                        // =================================================
                        const params_update_json = create_update_array(
                          records,
                          selectedFields,
                          updateValues
                        );

                        console.log("一括更新JSON:", params_update_json);

                        // =================================================
                        // 100件ずつ分割
                        // =================================================
                        const chunks = chunkArray(
                          params_update_json,
                          CONFIG.updateLimit
                        );

                        console.log("更新件数:", params_update_json.length);
                        console.log("API実行回数:", chunks.length);

                        // =================================================
                        // 100件ずつ順番に更新
                        // =================================================
                        let updatedCount = 0;

                        for (let i = 0; i < chunks.length; i++) {
                          const chunk = chunks[i];

                          const putParams = {
                            app: appId,
                            records: chunk,
                          };

                          console.log(
                            `更新処理 ${i + 1} / ${chunks.length}`,
                            chunk.length + "件"
                          );
                          // -------------------------------------------------
                          // 更新開始API
                          // -------------------------------------------------
                          await kintone.api(
                            kintone.api.url("/k/v1/records.json", true),
                            "PUT",
                            putParams
                          );
                          //更新した分を追加していく
                          updatedCount += chunk.length;

                          console.log(
                            "更新済み:",
                            updatedCount,
                            "/",
                            params_update_json.length
                          );
                        }

                        // =================================================
                        // ローディング終了
                        // =================================================
                        hideSpinner();

                        // =================================================
                        // 完了
                        // =================================================
                        swal(
                          {
                            title: "更新完了",
                            text: `${updatedCount.toLocaleString()}件のレコードを更新しました。`,
                            type: "success",
                            confirmButtonText: "OK",
                          },

                          function () {
                            $modal.remove();
                            $overlay.remove();
                            location.reload();
                          }
                        );
                      } catch (error) {
                        console.error("一括更新エラー:", error);
                        //ローダー終了
                        hideSpinner();
                        alert(
                          "更新に失敗しました。\n\n" +
                            (error.message || "不明なエラー")
                        );

                        // 処理が終わってからの処理
                      } finally {
                        // =============================================
                        // 一括更新完了
                        // 処理の成功/処理の失敗のどちらでも必ず解除
                        // =============================================
                      }
                    }
                  );
                } catch (error) {
                  console.error("対象レコード取得エラー:", error);
                  //ローダー終了
                  hideSpinner();

                  alert(
                    "対象レコードの取得に失敗しました。\n\n" +
                      (error.message || "不明なエラー")
                  );
                }
              }
            );
          });
        },

        // ===================================================
        // フィールド取得エラー
        // ===================================================
        function (error) {
          console.error("フィールド取得エラー:", error);
          alert("フィールド情報の取得に失敗しました。");
        }
      );
    }

    // =====================================================
    // 一括更新ボタン
    // =====================================================
    if ($(`#${CONFIG.buttonId}`).length > 0) {
      return event;
    }

    // =====================================================
    // ボタン生成
    // ボタン動作を指定
    // =====================================================
    const $btn_update_records = $("<button>", {
      id: CONFIG.buttonId,
      class: "custome-btn-ui",
      html: '<i class="fa-solid fa-arrows-rotate"></i> 一括更新処理',
    })
      .css({
        padding: "10px 20px",
        border: "none",
        "border-radius": "4px",
        "background-color": "#3498db",
        color: "#fff",
        cursor: "pointer",
        "font-size": "16px",
        height: "48px",
        "box-sizing": "border-box",
        transition: "background-color 0.2s ease, transform 0.1s ease",
      })
      // マウスホバー時
      .on("mouseenter", function () {
        $(this).css("background-color", "#2980b9");
      })
      // マウスアウト時
      .on("mouseleave", function () {
        $(this).css("background-color", "#3498db");
      })
      //
      .on("mousedown", function () {
        $(this).css("transform", "translateY(1px)");
      })
      //
      .on("mouseup", function () {
        $(this).css("transform", "translateY(0)");
      })
      //クリック時
      .on("click", function () {
        updateRecords(event);
      });
    // =====================================================
    // ヘッダーに一括更新処理ボタン追加
    // =====================================================
    const headerSpace = kintone.app.getHeaderMenuSpaceElement();
    $(headerSpace).append($btn_update_records);
    return event;
  });
})();
