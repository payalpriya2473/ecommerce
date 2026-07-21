<?php

error_reporting(E_ALL);
include '../class/db-connect.php';

function dnd($var) { echo "<pre>"; var_dump($var); echo "</pre>"; die(); }
function change_date_format($format, $date) { return date($format, strtotime($date)); }
function today_date() { return date('d-m-Y'); }


function build_stock_sql($whereClause, $includeOpqty = true) {
    $opSelect  = $includeOpqty ? 'itemmast.opqty,' : '';
    $opOuter   = $includeOpqty ? 'STK.opqty,'      : '';
    $opFinal   = $includeOpqty ? 'finalSTK.opqty,' : '';
    $opGroupBy = $includeOpqty ? 'itemmast.opqty,' : '';

    return "select fstk.*, pord.penord from (SELECT
            finalSTK.TSTOCK, finalSTK.DSTOCK, finalSTK.ASTOCK, finalSTK.ITEM, finalSTK.incentive, finalSTK.offerprice,
            finalSTK.PDEL, finalSTK.ITEMGROUP, finalSTK.BRAND, sch.schamt,
            finalSTK.hsncode, finalSTK.gst, finalSTK.margin_prc, $opFinal finalSTK.minqty,
            finalSTK.mopprc, finalSTK.mopamt, finalSTK.nlc, finalSTK.category
            FROM
            (
                SELECT
                    STK.TSTOCK, STK.DSTOCK, STK.ASTOCK, STK.ITEM, STK.incentive, STK.offerprice,
                    STK.ITEMGROUP, STK.BRAND, PDEL.PDEL,
                    STK.hsncode, STK.gst, STK.margin_prc, $opOuter STK.minqty, STK.mopprc, STK.mopamt,
                    STK.nlc, STK.category
                FROM
                    (
                    SELECT
                        COUNT(item) AS TSTOCK,
                        SUM(IIF(damagedesc <> '', 1, 0)) AS DSTOCK,
                        SUM(IIF(DATEADD('M', itemgroup.fmonths, pdate) < DATEVALUE(NOW()), 1, 0)) AS ASTOCK,
                        itemmast.dsltd AS incentive,
                        itemmast.mrp AS offerprice,
                        ITEMMAST.GROUP1 AS ITEMGROUP,
                        ITEMMAST.BRAND,
                        psrno.item,
                        itemmast.hsncode,
                        itemmast.gst,
                        itemmast.width AS margin_prc,
                        $opSelect
                        itemmast.minqty,
                        itemmast.mopprc,
                        itemmast.mopamt,
                        itemmast.[show] AS nlc,
                        itemgroup.category
                    FROM psrno, itemgroup, itemmast
                    WHERE
                        psrno.sinvno = 0 AND
                        psrno.item = itemmast.description AND
                        itemmast.group1 = itemgroup.name ".$whereClause."
                    GROUP BY
                        psrno.item,
                        itemmast.dsltd,
                        itemmast.mrp,
                        ITEMMAST.GROUP1,
                        ITEMMAST.BRAND,
                        itemmast.hsncode,
                        itemmast.gst,
                        itemmast.width,
                        $opGroupBy
                        itemmast.minqty,
                        itemmast.mopprc,
                        itemmast.mopamt,
                        itemmast.[show],
                        itemgroup.category
                    ) AS STK
                LEFT JOIN
                (
                    SELECT COUNT(SALES.ITEM) AS PDEL, ITEM
                    FROM SALES WHERE SALES.SRNO = '' GROUP BY ITEM
                ) AS PDEL
                ON PDEL.ITEM = STK.ITEM
            ) AS finalSTK
            LEFT JOIN
            (
                SELECT SUM(incamt) AS schamt, item
                FROM scheme
                WHERE sdate <= DATEVALUE(NOW()) AND edate >= DATEVALUE(NOW())
                GROUP BY item
            ) AS sch
            ON sch.item = finalSTK.item
            order by finalSTK.ITEMGROUP, finalSTK.BRAND, finalSTK.ITEM) as fstk
            left join (select sum(bqty) as penord, item from sorderdet where bqty > 0 group by item) as pord
            on pord.item = fstk.item";
}

if ($_SERVER['PHP_AUTH_USER'] == $GLOBALS['tokenname'] && $_SERVER['PHP_AUTH_PW'] == $GLOBALS['tokenvalue']) {
    $response = [];

    $item_group   = isset($_POST['itemgroup'])    ? $_POST['itemgroup']    : null;
    $item         = isset($_POST['item'])         ? $_POST['item']         : null;
    $branch       = isset($_POST['branch'])       ? $_POST['branch']       : null;
    $brand        = isset($_POST['brand'])        ? $_POST['brand']        : null;
    $company_code = isset($_POST['company_code']) ? $_POST['company_code']
                  : (isset($_GET['company_code']) ? $_GET['company_code'] : null);

    $account_db = $GLOBALS['config']["account_select"];
    $company_sql = "SELECT * FROM company_info WHERE Company_code = '$company_code'";
    $company_getarrcount = odbc_exec($account_db, $company_sql);
    while ($row = odbc_fetch_array($company_getarrcount)) {
        $dbfilename = $GLOBALS['config']["source_db"] . '/' . $row['Company_code'] . ".mdb";
        $comapny_code_db = $row['Company_code'];
    }
    $GLOBALS['config']["motabhai_" . $company_code] =
        odbc_connect("Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=$dbfilename", "", "rajZsdc7");
    $new_con = $GLOBALS['config']["motabhai_" . $company_code];


    if (!empty($_POST['debug']) || !empty($_GET['debug'])) {
        $diag = [];

        $im = @odbc_exec($new_con, "SELECT TOP 1 * FROM itemmast");
        if ($im) {
            $r = odbc_fetch_array($im);
            $diag['itemmast_columns'] = $r ? array_keys($r) : [];
            $diag['itemmast_sample']  = $r ?: null;
        } else {
            $diag['itemmast_error'] = odbc_errormsg($new_con);
        }

        $ig = @odbc_exec($new_con, "SELECT TOP 1 * FROM itemgroup");
        if ($ig) {
            $r2 = odbc_fetch_array($ig);
            $diag['itemgroup_columns'] = $r2 ? array_keys($r2) : [];
            $diag['itemgroup_sample']  = $r2 ?: null;
        } else {
            $diag['itemgroup_error'] = odbc_errormsg($new_con);
        }

        echo json_encode(['success' => true, 'debug' => $diag]);
        odbc_close($new_con);
        exit;
    }

    $conditions = [];
    if (!empty($item_group)) { $conditions[] = "itemmast.group1 = '$item_group'"; }
    if (!empty($item))       { $conditions[] = "psrno.ITEM = '$item'"; }
    if (!empty($brand))      { $conditions[] = "itemmast.BRAND = '$brand'"; }
    if (!empty($branch))     { $conditions[] = "psrno.branch = '$branch'"; }
    $whereClause = '';
    if (!empty($conditions)) { $whereClause = "And " . implode(' AND ', $conditions); }

    // Try the full query (with opqty); if the column doesn't exist, retry without it.
    $hasOpqty = true;
    $result = @odbc_exec($new_con, build_stock_sql($whereClause, true));
    if (!$result) {
        $hasOpqty = false;
        $result = odbc_exec($new_con, build_stock_sql($whereClause, false));
    }
    if (!$result) { die("Query execution failed: " . odbc_errormsg($new_con)); }

    $resultsArray = [];
    while ($row = odbc_fetch_array($result)) {
        $resultsArray[] = [
            'ITEM'       => htmlspecialchars($row['ITEM']),
            'TSTOCK'     => htmlspecialchars($row['TSTOCK']),
            'DSTOCK'     => htmlspecialchars($row['DSTOCK']),
            'ASTOCK'     => htmlspecialchars($row['ASTOCK']),
            'incentive'  => htmlspecialchars($row['incentive']),
            'offerprice' => htmlspecialchars($row['offerprice']),
            'PDEL'       => htmlspecialchars($row['PDEL']),
            'ITEMGROUP'  => htmlspecialchars($row['ITEMGROUP']),
            'BRAND'      => htmlspecialchars($row['BRAND']),
            'schamt'     => htmlspecialchars($row['schamt']),
            'penord'     => htmlspecialchars($row['penord']),
            // ── master fields ──
            'hsncode'    => htmlspecialchars($row['hsncode']),
            'gst'        => htmlspecialchars($row['gst']),
            'margin_prc' => htmlspecialchars($row['margin_prc']),
            'opqty'      => $hasOpqty ? htmlspecialchars($row['opqty']) : '',
            'minqty'     => htmlspecialchars($row['minqty']),
            'mopprc'     => htmlspecialchars($row['mopprc']),
            'mopamt'     => htmlspecialchars($row['mopamt']),
            'nlc'        => htmlspecialchars($row['nlc']),
            'category'   => htmlspecialchars($row['category']),
        ];
    }

    if (!empty($resultsArray)) {
        $response['total_qty']        = '0';
        $response['total_p_delivery'] = '0';
        $response['stock_search']     = $resultsArray;
        $response['flag']             = 1;
    } else {
        $response['flag']    = 0;
        $response['message'] = 'No Data Found';
    }

    echo json_encode($response);

} else {
    $response = [];
    $response['message'] = 'Sorry You Are not Allowed to access';
    echo json_encode($response);
}

odbc_close($new_con);
?>
