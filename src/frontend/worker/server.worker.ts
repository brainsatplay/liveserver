//The worker thread. 
//This can run all of the web interfaces as well as serial interfaces. 
//The web interfaces need their own env setup e.g. mongoose or express instances
//if on frontend, the workers can't run backend env-required APIs like mongodb or http/socket/event routers
//if on backend, the workers can't run DOM-related or rendering APIs like canvas or threejs

import { SessionsService } from "src/backend";
import { UnsafeService   } from "src/backend";
import { DatabaseService } from "src/backend";
//can import all

import { parseFunctionFromText, randomId, Router, Service } from "src/common";



export class ServerWorker extends Service {
    name:string='worker';
    id=randomId('worker');
    Router:Router;
    responses=[];

    routes = [
        {
            route:'workerPost',
            callback:(self,args,origin)=>{
              console.log('worker message received!', args, origin);
              return;
            }
        },
        {
            route:'addservice',
            callback:(self,args,origin)=>{
                //provide service name and setup arguments (e.g. duplicating server details etc)
                return;
            }
        },
        {
            route:'removeservice',
            callback:(self,args,origin)=>{
                return;
            }
        },
        { //MessageChannel port, it just runs the whole callback system to keep it pain-free, while allowing messages from other workers
            route: 'addport', 
            callback: (self, args, origin) => { //args[0] = eventName, args[1] = case, only fires event if from specific same origin
                let port = args[1]; //messageport 
                this[`${origin}`] = port; //message ports will have the origin marked as the worker id 
                port.onmessage = onmessage; //port messages get processed generically, an argument will denote they are from a worker 
                return true;
            }
        },
        {
            route:'postMessagePort', //send a message to another worker via a message port
            callback:(self,args,origin) => {
                if(!args[1]){
                    if(this[`${origin}`]) 
                        this[`${origin}`].postMessage(JSON.stringify(args[0]),undefined,args[2]); //0 is whatever, 2 is transfer array
                } else {
                    if(this[`${args[1]}`])
                        this[`${args[1]}`].postMessage(JSON.stringify(args[0]),undefined,args[2]);
                }
                return;
            }
        },
        {
            route:'postMessage', //post back to main thread
            callback:(self,args,origin)=>{
                postMessage(args[0],undefined,args[1]); //0 is args, 1 is transfer array
                return;
            }
        },
        {
            route:'addcallback',
            callback:(self,args,origin)=>{
                if(!args[0] && !args[1]) return;
                let func = parseFunctionFromText(args[1]);
                if(func) this.addCallback(args[0],func);
                return true;
            }
        },
        {
            route:'removecallback',
            callback:(self,args,origin)=>{
                if(args[0]) this.removeCallback(args[0]);
                return true;
            }
        },
        {
            route:'run',
            callback:(self,args,origin)=>{
                let c = this.responses.find((o) => {
                    if(o.name === args[0]) {
                        return true;
                    }
                });
                if(c && args[1]) return c.callback(args[1]); 
                return;
            }
        }
    ]

    constructor() {
        super()
    }

        //automated responses
    addCallback(name='',callback=(result)=>{}) {
        if(name.length > 0 && !this.responses.find((o)=>{if(typeof o === 'object') {if(o.name === name) return true;} return})) {
            this.responses.push({name:name,callback:callback});
        }
    }
    
    //remove automated response by name
    removeCallback(nameOrIdx='') {
        if(nameOrIdx.length > 0) {
            let idx;
            if(this.responses.find((o,i)=>{if(typeof o === 'object') {if(o.name === nameOrIdx) { idx = i; return true;}}  return})) {
            if (idx) this.responses.splice(idx,1);
            }
        } else if (typeof nameOrIdx === 'number') {
            this.responses.splice(nameOrIdx,1);
        }
    }
}

let router = new Router({debug:false});
let worker = new ServerWorker();
router.load(worker);

//message from main thread or port
self.onmessage = async (event) => {
    //do the thing with the router
    if(event.data.workerId) {
        worker.id = event.data.workerId;
        if(event.data.port) worker[event.data.origin] = event.data.port; //set the message channel port as the output
    }

    if(event.data) {
        worker.notify(event.data,undefined,event.data.origin);
    }
    //if origin is a message port, pass through the port
    //if origin is main thread, pass to main thread
    //else pass to respective web apis

    // Run Response Callbacks
    if(!event.data.route.includes('run')) {
        worker.responses.forEach((foo,_) => {
            if(typeof foo === 'object') foo.callback(event.data);
            else if (typeof foo === 'function') foo(event.data);
        });
    }
}

export default self;