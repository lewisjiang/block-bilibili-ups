// ==UserScript==
// @name         Block Bilibili Up
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  通过up主用户名屏蔽B站Up
// @author       Boku
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @require      https://cdn.staticfile.org/jquery/3.4.1/jquery.min.js
// @run-at document-end

// ==/UserScript==
/* eslint-env jquery */
(function() {

    //在这里输入你想屏蔽的Up名字
    let disableUpList = [
        "bbb",
        "aaa"
    ];

    let disableUp = function(){
        disableUpList.forEach(function(value,index,array){
            let containsString = ":contains('" + value + "')";

            // 屏蔽搜索页面
            // $("a.up-name" + containsString).parents('li.video-item').hide();
            $("span.bili-video-card__info--author" + containsString).parents('div.bili-video-card').hide();

            // 屏蔽主页面
            // $("a.ex-up" + containsString).parents("div.video-card-common").hide();
            $("span.bili-video-card__info--author" + containsString).parents("div.bili-feed-card").remove();

            // 屏蔽排行榜
            // $("span.name" + containsString).parents("div.rank-wrap").hide();
            $("span.up-name" + containsString).parents("li.rank-item").remove();

            // 屏蔽热门页面
            $("span.up-name__text" + containsString).parents("div.video-card").remove();
        });
    }

    //disableUp();
    let count = 0;
    document.addEventListener('DOMNodeInserted', function() {
        disableUp();
    }, false);
})();

// 原作者：末夜の十字 https://www.bilibili.com/read/cv13500871
