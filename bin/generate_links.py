#!/usr/bin/env python3

import csv


template = ("https://graph-planning-634e23467632.herokuapp.com/exp?hitId=meg1&mode=live&"
            "assignmentId=stage{stage}&workerId=P{pid}-stage{stage}&condition={pid}")

headers = ['subid', 'netid', 'link1', 'link2']
rows = [[f'P{i}', '', template.format(pid=i, stage=1), template.format(pid=i, stage=2)]
        for i in range(31,100)]

with open('links.csv', mode='w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(headers)
    writer.writerows(rows)
