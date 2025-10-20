import * as fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import * as xpath from "xpath";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import { toXML } from "jstoxml";
import * as path from "path";

/**
 * Export of the interface for the options when constructing a new instance of the PitStopServer class
 */
export interface PitStopServerOptions {
  inputPDF: string;
  outputPDFName?: string;
  outputFolder: string;
  preflightProfile?: string;
  actionLists?: string[];
  variableSet?: string;
  variableSetName?: string;
  pdfReport?: boolean;
  pdfReportName?: string;
  xmlReport?: boolean;
  xmlReportName?: string;
  jsonReport?: boolean;
  jsonReportName?: string;
  taskReport?: boolean;
  taskReportName?: string;
  configFile?: string;
  configFileName?: string;
  applicationPath?: string;
  measurementUnit?: "Millimeter" | "Centimeter" | "Inch" | "Point";
  language?: string;
  maxReportItemsPerCategory?: number;
  maxReportOccurencesPerItem?: number;
}

/**
 * Export of the interface for each individual variable for use in VariableSetOptions
 */
export interface VSOption {
  variable: string;
  type: "Number" | "String" | "Boolean" | "Length";
  value: string | number | boolean;
}

/**
 * Export of the interface for the creation or update of a variable set (an array of VSOption)
 */
export interface VariableSetOptions extends Array<VSOption> {}

/**
 * Export of the class PitStop Server
 */
export class PitStopServer {
  static applicationPath: string;
  private configFile: string | undefined;
  private configFileName: string;
  private finalConfigFilePath: string;
  private inputPDF: string | undefined;
  private outputPDFName: string | undefined;
  private outputFolder: string | undefined;
  private preflightProfile: string | undefined;
  private actionLists: string[] | undefined;
  private variableSet: string | undefined;
  private variableSetName: string | undefined;
  private finalVariableSetPath: string | undefined;
  private pdfReport: boolean | undefined;
  private pdfReportName: string | undefined;
  private xmlReport: boolean | undefined;
  private xmlReportName: string | undefined;
  private jsonReport: boolean | undefined;
  private jsonReportName: string | undefined;
  private taskReport: boolean | undefined;
  private taskReportName: string | undefined;
  public debugMessages: string[];
  private measurementUnit?: "Millimeter" | "Centimeter" | "Inch" | "Point";
  private language?: string;
  private startExecutionTime: number | undefined;
  private endExecutionTime: number | undefined;
  public executionTime: number;
  private maxReportItemsPerCategory: number;
  private maxReportOccurencesPerItem: number;

  //////////////////////////////////////////////////////////////////////////
  //
  // Constructor
  //
  //////////////////////////////////////////////////////////////////////////
  /**
   * Constructs a PitStopServer instance
   * @param options
   */
  public constructor(options: PitStopServerOptions) {
    //check the presence of the mandatory options
    if (options.inputPDF == undefined || options.outputFolder == undefined) {
      throw new Error("The mandatory options for running PitStop Server were not correctly defined");
    }
    if (options.actionLists == undefined && options.preflightProfile == undefined) {
      throw new Error("There was neither a Preflight Profile nor any Action Lists defined for running PitStop Server");
    }

    //set some default values
    this.debugMessages = [];
    this.configFileName = "config.xml";
    this.xmlReport = false;
    this.jsonReport = false;
    this.taskReportName = "taskreport.xml";
    this.variableSetName = "variableset.evs";
    this.measurementUnit = "Millimeter";
    this.language = "enUS";
    this.executionTime = 0;
    this.maxReportItemsPerCategory = 100;
    this.maxReportOccurencesPerItem = 100;

    //initialize the instance variables with the values of the options
    for (const option in options) {
      const key = option as keyof PitStopServerOptions;
      this.debugMessages.push("Received option " + option + " = " + options[key]);
      switch (option) {
        case "inputPDF":
          this.inputPDF = options.inputPDF;
          break;
        case "outputPDFName":
          this.outputPDFName = options.outputPDFName!;
        case "outputFolder":
          this.outputFolder = options.outputFolder;
          break;
        case "preflightProfile":
          this.preflightProfile = options.preflightProfile!;
          break;
        case "actionLists":
          this.actionLists = options.actionLists!;
          break;
        case "variableSet":
          this.variableSet = options.variableSet!;
          break;
        case "pdfReport":
          this.pdfReport = options.pdfReport!;
          break;
        case "pdfReportName":
          this.pdfReportName = options.pdfReportName!;
          break;
        case "xmlReport":
          this.xmlReport = options.xmlReport!;
          break;
        case "xmlReportName":
          this.xmlReportName = options.xmlReportName!;
          break;
        case "jsonReport":
          this.jsonReport = options.jsonReport!;
          break;
        case "jsonReportName":
          this.jsonReportName = options.jsonReportName!;
          break;
        case "taskReport":
          this.taskReport = options.taskReport!;
          break;
        case "taskReportName":
          this.taskReportName = options.taskReportName!;
          break;
        case "configFile":
          this.configFile = options.configFile!;
          break;
        case "configFileName":
          this.configFileName = options.configFileName!;
          break;
        case "applicationPath":
          PitStopServer.applicationPath = options.applicationPath!;
          break;
        case "measurementUnit":
          this.measurementUnit = options.measurementUnit;
          break;
        case "language":
          this.language = options.language;
          break;
        case "maxReportItemsPerCategory":
          this.maxReportItemsPerCategory = options.maxReportItemsPerCategory!;
          break;
        case "maxReportOccurencesPerItem":
          this.maxReportOccurencesPerItem = options.maxReportOccurencesPerItem!;
          break;
        default:
          this.debugMessages.push("Unknown option " + option + " specified");
      }
    }

    //set default values that are based on the input PDF name
    if (this.outputPDFName == undefined) {
      this.outputPDFName = path.parse(this.inputPDF!).name + ".pdf";
    }
    if (this.pdfReportName == undefined) {
      this.pdfReportName = path.parse(this.inputPDF!).name + "_report.pdf";
    }
    if (this.xmlReportName == undefined) {
      this.xmlReportName = path.parse(this.inputPDF!).name + ".xml";
    }
    if (this.jsonReportName == undefined) {
      this.jsonReportName = path.parse(this.inputPDF!).name + ".json";
    }

    //check if the output folder exists and is writable
    if (fs.existsSync(this.outputFolder!) == false) {
      throw new Error("The output folder " + options.outputFolder + " does not exist");
    } else {
      try {
        fs.accessSync(this.outputFolder!, fs.constants.W_OK);
      } catch (error) {
        throw new Error("The output folder " + options.outputFolder + " is not writable");
      }
    }

    //check if the specified path to the cli exists or find it
    if (PitStopServer.applicationPath !== undefined) {
      if (fs.existsSync(PitStopServer.applicationPath) == false) {
        throw new Error("The path to the CLI does not exist (" + PitStopServer.applicationPath + ")");
      }
    } else {
      try {
        this.debugMessages.push("Searching for the application path");
        PitStopServer.getApplicationPath();
      } catch (error) {
        throw error;
      }
    }

    //create a basic config file if needed
    this.finalConfigFilePath = this.outputFolder + "/" + this.configFileName;
    if (options.configFile == undefined) {
      this.createBasicConfigFile();
    } else {
      this.debugMessages.push("Using template configuration file " + options.configFile);
      if (!this.configFile || fs.existsSync(this.configFile) == false) {
        throw new Error("The configuration file " + this.configFile + " does not exist");
      } else {
        fs.copyFileSync(this.configFile, this.finalConfigFilePath);
      }
    }
    
  }

  //////////////////////////////////////////////////////////////////////////
  //
  // PitStopServer public instance methods
  //
  //////////////////////////////////////////////////////////////////////////

  /**
   * Helper method to execute commands using Node.js native exec
   * @param command - The command to execute
   * @param args - Array of arguments
   * @returns Promise with execution result
   */
  private executeCommand = async (command: string, args: string[]): Promise<{command: string, exitCode: number, stdout: string, stderr: string}> => {
    const execAsync = promisify(exec);
    const fullCommand = `"${command}" ${args.join(' ')}`;
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      return {
        command: fullCommand,
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error: any) {
      return {
        command: fullCommand,
        exitCode: error.code || -1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message
      };
    }
  };
  /**
   * Runs PitStop Server
   * @returns execution result
   */
  run = async () => {
    //add the input file, output folder and the profile and action lists, the report types, and the variable set to the config file
    try {
      this.updateConfigFile();
    } catch (error) {
      throw error;
    }

    //the return value is an object with the execution result
    this.debugMessages.push("CLI path: " + PitStopServer.applicationPath);
    this.debugMessages.push("PitStop Server started at " + new Date().toISOString());
    this.startExecutionTime = new Date().getTime();
    let execResult: {command: string, exitCode: number, stdout: string, stderr: string};
    try {
      execResult = await this.executeCommand(PitStopServer.applicationPath, ["-config", this.finalConfigFilePath]);
      this.debugMessages.push("PitStop Server ended at " + new Date().toISOString());
      this.endExecutionTime = new Date().getTime();
      this.executionTime = this.endExecutionTime - this.startExecutionTime;
      return execResult;
    } catch (error) {
      this.endExecutionTime = new Date().getTime();
      this.executionTime = this.endExecutionTime - this.startExecutionTime;
      if (typeof error === 'object' && error !== null && 'command' in error && 'exitCode' in error && 'stdout' in error && 'message' in error) {
        return {
          command: (error as any).command,
          exitCode: (error as any).exitCode,
          stdout: (error as any).stdout,
          stderr: (error as any).message
        };
      } else {
        return { command: '', exitCode: -1, stdout: '', stderr: String(error) };
      }
    }
  };

  /**
   * Based on a simple object the variable set file is created and saved in the output folder
   * @param values
   */
  createVariableSet = (values: VariableSetOptions) => {
    this.debugMessages.push("Creating a variable set");
    this.variableSet = this.outputFolder + "/" + this.variableSetName;
    this.finalVariableSetPath = this.outputFolder + "/" + this.variableSetName;
    const xmlOptions = {
      header: true,
      indent: "  ",
    };

    let variableNode: Record<string, any>, variabletype: string;
    let variableNodes: Array<Record<string, any>> = [];
    for (let i = 0; i < values.length; i++) {
      variableNode = {
        _name: "Variable",
        _content: {
          Name: values[i].variable,
          ResultType: values[i].type,
          SourceType: "com.enfocus.variabletype.inline",
          SourceVersion: "1",
          OperatorID: (i + 1).toString(),
        },
      };
      variableNodes.push(variableNode);
    }

    let operatorNode;
    let operatorNodes: Array<any> = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i].type == "Length") {
        //convert to points based on the measurementUnit
        if (this.measurementUnit == "Millimeter") {
          this.debugMessages.push("Converting value of " + values[i].variable + " (" + values[i].value + ") from mm to points");
          values[i].value = (parseFloat(values[i].value.toString()) / 25.4) * 72;
        } else if (this.measurementUnit == "Centimeter") {
          this.debugMessages.push("Converting value of " + values[i].variable + " (" + values[i].value + ") from cm to points");
          values[i].value = (parseFloat(values[i].value.toString()) / 2.54) * 72;
        } else if (this.measurementUnit == "Inch") {
          this.debugMessages.push("Converting value of " + values[i].variable + " (" + values[i].value + ") from in to points");
          values[i].value = parseFloat(values[i].value.toString()) * 72;
        }
        if (isNaN(values[i].value as number)) {
          this.debugMessages.push("The value of " + values[i].variable + " was not a number, it is set to 0");
          values[i].value = 0;
        }
      }
      operatorNode = {
        _name: "Operator",
        _content: {
          OperatorType: "com.enfocus.operator.constant",
          GUID: (i + 1).toString(),
          OperatorData: { Value: values[i].value, ValueType: "String" }, //"String" here is fixed, it is not the result type!
          OperatorVersion: 1,
        },
      };
      operatorNodes.push(operatorNode);
    }

    let evs = {
      _name: "VariableSet",
      _attrs: {
        xmlns: "http://www.enfocus.com/2012/EnfocusVariableSet",
      },
      _content: {
        Version: "1",
        Name: "variableset",
        Variables: variableNodes,
        Operators: operatorNodes,
      },
    };

    try {
      fs.writeFileSync(this.finalVariableSetPath, toXML(evs, xmlOptions));
    } catch (err) {
      throw err;
    }
  };

  /**
   * The variable set template is updated and saved in its final version to the output folder
   * @param values
   */
  updateVariableSet = (values: VariableSetOptions) => {
    if (this.finalVariableSetPath == undefined) {
      throw new Error("There is no Variable Set defined");
    }
    // Process the input variable set so it is filled with the correct values from the values that are specified
    this.debugMessages.push("Modifying the variable set file");
    let evs;
    try {
      let evsContent = fs.readFileSync(this.finalVariableSetPath).toString();
      let parser = new DOMParser({
        errorHandler: {
          warning: (msg) => {
            //ignore
          },
          error: (msg) => {
            throw new Error(msg);
          },
          fatalError: (msg) => {
            throw new Error(msg);
          },
        },
      });
      evs = parser.parseFromString(evsContent, "text/xml");
    } catch (error) {
      throw error;
    }
    let select = xpath.useNamespaces({ evs: "http://www.enfocus.com/2012/EnfocusVariableSet" });

    //modify the EVS structure with the new values
    //typing the variables is very unpractical with xpath, so here it is mostly any
    let node: any;
    let oldValue: any, newValue: any;
    let operatorID: string;
    let xpExpression: string;
    let resultType: string;
    let oldUnitNode: any, newUnitNode: any;
    let unitNodeParent: any, unitNodeText: Text;
    for (let i = 0; i < values.length; i++) {
      xpExpression = "/evs:VariableSet/evs:Variables/evs:Variable[evs:Name='" + values[i].variable + "']/evs:OperatorID";
      const operatorIDResult = select("string(" + xpExpression + ")", evs);
      operatorID = operatorIDResult ? operatorIDResult.toString() : '';
      if (operatorID == "") {
        throw new Error("The variable " + values[i].variable + " is not present in the variable set " + this.variableSet);
      }
      xpExpression = "/evs:VariableSet/evs:Variables/evs:Variable[evs:Name='" + values[i].variable + "']/evs:ResultType";
      const resultTypeNode = select("string(" + xpExpression + ")", evs);
      resultType = resultTypeNode != null ? resultTypeNode.toString() : '';
      if (resultType == "Length") {
        xpExpression = "/evs:VariableSet/evs:Variables/evs:Variable[evs:Name='" + values[i].variable + "']/evs:DefaultUnit";
        oldUnitNode = select(xpExpression, evs);
        unitNodeText = evs.createTextNode("mm");
        if (oldUnitNode == undefined) {
          newUnitNode = evs.createElement("evs:DefaultUnit");
          newUnitNode.appendChild(unitNodeText);
          unitNodeParent = select("/evs:VariableSet/evs:Variables/evs:Variable[evs:Name='" + values[i].variable + "']", evs);
          unitNodeParent.appendChild(newUnitNode);
        } else {
          oldUnitNode.replaceChild(unitNodeText, oldUnitNode.getFirstChild());
        }
      }
      xpExpression = "/evs:VariableSet/evs:Operators/evs:Operator[evs:GUID='" + operatorID + "']/evs:OperatorData/evs:Value";
      node = select(xpExpression, evs);
      if (node.length == 0) {
        throw new Error("Error finding a value for variable " + values[i].variable + " in the variable set");
      } else {
        oldValue = select("evs:Value", evs);
        newValue = evs.createTextNode(values[i].value.toString());
        //node.replaceChild(newValue, node.getFirstChild());
        node[0].replaceChild(newValue, oldValue);
      }
    }
    try {
      fs.writeFileSync(this.finalVariableSetPath, evs.toString());
    } catch (err) {
      throw err;
    }
  };

  /**
   * Removes the output folder and all the contents
   */
  public cleanup = () => {
    try {
      fs.rmSync(this.outputFolder!, { recursive: true, force: true });
    } catch (error) {
      throw error;
    }
  };

  public getTaskConfig = () => {
    if (this.finalConfigFilePath == undefined) {
      throw new Error("There is no configuration file defined");
    }
    if (fs.existsSync(this.finalConfigFilePath) == false) {
      throw new Error("The configuration file " + this.finalConfigFilePath + " does not exist anymore");
    }
    const taskConfigString = fs.readFileSync(this.finalConfigFilePath).toString();
    return taskConfigString;
  };

  //////////////////////////////////////////////////////////////////////////
  //
  // PitStopServer private API methods
  //
  //////////////////////////////////////////////////////////////////////////
  /**
   * Updates the config file with all settings just before running PitStop Server
   */
  private updateConfigFile = () => {
    //read the final XML config file into a DOM for modification
    //the final config file is either a basic one created by the class or
    //a copy of a config file provided by the calling instance
    this.debugMessages.push("Modifying the configuration file");
    let xml: Document;
    try {
      let xmlContent = fs.readFileSync(this.finalConfigFilePath).toString();
      let parser = new DOMParser({
        locator: {},
        errorHandler: {
          warning: (msg) => {
            //ignore
          },
          error: (msg) => {
            throw new Error(msg);
          },
          fatalError: (msg) => {
            throw new Error(msg);
          },
        },
      });
      xml = parser.parseFromString(xmlContent);
    } catch (error) {
      throw error;
    }
    let select = xpath.useNamespaces({ cf: "http://www.enfocus.com/PitStop/24/PitStopServerCLI_Configuration.xsd" });
    let newElem: Element, newText: Text;

    //modify the config file
    let inputFileName = "";
    try {
      //fill in the input file and the output file

      if (typeof this.inputPDF == "string") {
        this.debugMessages.push("Adding the input file " + this.inputPDF + " to the configuration file");
        if (fs.existsSync(this.inputPDF) == false) {
          throw new Error("The input PDF " + this.inputPDF + " does not exist");
        }
        let inputPathNode = select("//cf:InputPath", xml);
        newText = xml.createTextNode(this.inputPDF);
        // Ensure inputPathNode is an array of Node and has at least one element
        if (
            Array.isArray(inputPathNode) &&
            inputPathNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (inputPathNode[0] as Node).appendChild(newText);
        } else {
            throw new Error('Could not find <cf:InputPath> node in the configuration XML.');
        }
        inputFileName = path.parse(this.inputPDF).name;
      }

      if (typeof this.outputFolder == "string") {
        if (fs.existsSync(this.outputFolder) == false) {
          throw new Error("The output folder " + this.outputFolder + " does not exist");
        }
        let outputPathNode = select("//cf:OutputPath", xml);
        newText = xml.createTextNode(this.outputFolder + "/" + this.outputPDFName);
        if (
            Array.isArray(outputPathNode) &&
            outputPathNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (outputPathNode[0] as Node).appendChild(newText);
        } else {
            throw new Error('Could not find <cf:OutputPath> node in the configuration XML.');
        }
      }

      let mutatorsNode = select("//cf:Mutators", xml);
      //add the preflight profile
      if (typeof this.preflightProfile == "string") {
        this.debugMessages.push("Adding the preflight profile " + this.preflightProfile + " to the configuration file");
        if (fs.existsSync(this.preflightProfile) == false) {
          throw new Error("The Preflight Profile " + this.preflightProfile + " does not exist");
        }
        this.debugMessages.push("Adding preflight profile " + this.preflightProfile);
        newElem = xml.createElement("cf:PreflightProfile");
        newText = xml.createTextNode(this.preflightProfile);
        newElem.appendChild(newText);
        if (
            Array.isArray(mutatorsNode) &&
            mutatorsNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (mutatorsNode[0] as Node).appendChild(newElem);
        } else {
            throw new Error('Could not find <cf:Mutators> node in the configuration XML.');
        }
      }

      //add the action lists
      if (this.actionLists !== undefined && this.actionLists.constructor == Array) {
        for (let i = 0; i < this.actionLists.length; i++) {
          if (fs.existsSync(this.actionLists[i]) == false) {
            throw new Error("The Action List " + this.actionLists[i] + " does not exist");
          }
          this.debugMessages.push("Adding action list " + this.actionLists[i]);
          newElem = xml.createElement("cf:ActionList");
          newText = xml.createTextNode(this.actionLists[i]);
          newElem.appendChild(newText);
          if (
              Array.isArray(mutatorsNode) &&
              mutatorsNode.length > 0 &&
              xml.defaultView !== null
          ) {
              (mutatorsNode[0] as Node).appendChild(newElem);
          } else {
              throw new Error('Could not find <cf:Mutators> node in the configuration XML.');
          }
        }
      }

      //add the reports
      if (this.xmlReport == true) {
        this.debugMessages.push("Defining an XML report");
        let reportsNode = select("//cf:Reports", xml);
        let newElemReportXML = xml.createElement("cf:ReportXML");
        if (
            Array.isArray(reportsNode) &&
            reportsNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (reportsNode[0] as Node).appendChild(newElemReportXML);
        } else {
            throw new Error('Could not find <cf:Reports> node in the configuration XML.');
        }
        let newElemReportPath = xml.createElement("cf:ReportPath");
        let newReportPathText = xml.createTextNode(this.outputFolder + "/" + this.xmlReportName);
        newElemReportPath.appendChild(newReportPathText);
        newElemReportXML.appendChild(newElemReportPath);
        let newElemVersion = xml.createElement("cf:Version");
        let newVersionText = xml.createTextNode("3");
        newElemVersion.appendChild(newVersionText);
        newElemReportXML.appendChild(newElemVersion);
        let newElemNrItems = xml.createElement("cf:MaxReportedNbItemsPerCategory");
        let newNrItemsText = xml.createTextNode(this.maxReportItemsPerCategory.toString());
        newElemNrItems.appendChild(newNrItemsText);
        newElemReportXML.appendChild(newElemNrItems);
        let newElemNrOccurrences = xml.createElement("cf:MaxReportedNbOccurrencesPerItem");
        let newNrOccurrencesText = xml.createTextNode(this.maxReportOccurencesPerItem.toString());
        newElemNrOccurrences.appendChild(newNrOccurrencesText);
        newElemReportXML.appendChild(newElemNrOccurrences);
      }
      if (this.jsonReport == true) {
        this.debugMessages.push("Defining a JSON report");
        let reportsNode = select("//cf:Reports", xml);
        let newElemReportJSON = xml.createElement("cf:ReportJSON");
        if (
            Array.isArray(reportsNode) &&
            reportsNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (reportsNode[0] as Node).appendChild(newElemReportJSON);
        } else {
            throw new Error('Could not find <cf:Reports> node in the configuration XML.');
        }
        let newElemReportPath = xml.createElement("cf:ReportPath");
        let newReportPathText = xml.createTextNode(this.outputFolder + "/" + this.jsonReportName);
        newElemReportPath.appendChild(newReportPathText);
        newElemReportJSON.appendChild(newElemReportPath);
        let newElemNrItems = xml.createElement("cf:MaxReportedNbItemsPerCategory");
        let newNrItemsText = xml.createTextNode(this.maxReportItemsPerCategory.toString());
        newElemNrItems.appendChild(newNrItemsText);
        newElemReportJSON.appendChild(newElemNrItems);
        let newElemNrOccurrences = xml.createElement("cf:MaxReportedNbOccurrencesPerItem");
        let newNrOccurrencesText = xml.createTextNode(this.maxReportOccurencesPerItem.toString());
        newElemNrOccurrences.appendChild(newNrOccurrencesText);
        newElemReportJSON.appendChild(newElemNrOccurrences);
      }
      if (this.pdfReport == true) {
        this.debugMessages.push("Defining a PDF report");
        let reportsNode = select("//cf:Reports", xml);
        let newElemReportPDF = xml.createElement("cf:ReportPDF");
        if (
            Array.isArray(reportsNode) &&
            reportsNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (reportsNode[0] as Node).appendChild(newElemReportPDF);
        } else {
            throw new Error('Could not find <cf:Reports> node in the configuration XML.');
        }
        let newElemReportPath = xml.createElement("cf:ReportPath");
        let newReportPathText = xml.createTextNode(this.outputFolder + "/" + this.pdfReportName);
        newElemReportPath.appendChild(newReportPathText);
        newElemReportPDF.appendChild(newElemReportPath);
      }
      if (this.taskReport == true) {
        this.debugMessages.push("Defining a task report");
        let taskReportNode = select("//cf:TaskReport", xml);
        let newElemTaskReport = xml.createElement("cf:TaskReportPath");
        if (
            Array.isArray(taskReportNode) &&
            taskReportNode.length > 0 &&
            xml.defaultView !== null
        ) {
            (taskReportNode[0] as Node).appendChild(newElemTaskReport);
        } else {
            throw new Error('Could not find <cf:TaskReport> node in the configuration XML.');
        }
        let newReportPathText = xml.createTextNode(this.outputFolder + "/" + this.taskReportName);
        newElemTaskReport.appendChild(newReportPathText);
      }

      let processNode = select("//cf:Process", xml);
      //add the variable set
      if (typeof this.variableSet == "string") {
        if (fs.existsSync(this.finalVariableSetPath!) == false) {
          throw new Error("The Variable Set " + this.finalVariableSetPath + " does not exist");
        }
        this.finalVariableSetPath = this.outputFolder + "/" + this.variableSetName;
        if (this.variableSet !== this.finalVariableSetPath) {
          this.debugMessages.push("Copying the variable set " + this.variableSet);
          fs.copyFileSync(this.variableSet, this.finalVariableSetPath);
        }
        this.debugMessages.push("Adding the variable set " + this.finalVariableSetPath);
        
        if (
            !Array.isArray(processNode) ||
            processNode.length === 0 ||
            xml.defaultView === null
        ) {
            throw new Error('Could not find <cf:Process> node in the configuration XML.');
        }
        
        let variableSetNode = select("cf:SmartPreflight/cf:VariableSet", processNode[0] as any);
        if (
            Array.isArray(variableSetNode) &&
            variableSetNode.length !== 0 &&
            xml.defaultView !== null
        ) {
          let oldValue = select("//cf:Process/cf:SmartPreflight/cf:VariableSet", xml);
          let newValue = xml.createTextNode(this.finalVariableSetPath);
          if (Array.isArray(oldValue) && oldValue.length > 0) {
            (variableSetNode[0] as Node).replaceChild(newValue, oldValue[0] as Node);
          }
        } else {
          let newElemSmartPreflight = xml.createElement("cf:SmartPreflight");
          (processNode[0] as Node).appendChild(newElemSmartPreflight);
          let newElemVariableSet = xml.createElement("cf:VariableSet");
          let newVariableSetText = xml.createTextNode(this.finalVariableSetPath);
          newElemVariableSet.appendChild(newVariableSetText);
          newElemSmartPreflight.appendChild(newElemVariableSet);
        }
      }

      //add the measurement units
      let measurementUnitNode = select("//cf:MeasurementUnit", xml);
      if (
          !Array.isArray(measurementUnitNode) ||
          measurementUnitNode.length === 0
      ) {
        this.debugMessages.push(
          "The configuration file does not contain a node for the measurement unit. The default will be used."
        );
      } else {
        let measurementUnitText = xml.createTextNode(this.measurementUnit!);
        if (
            xml.defaultView !== null
        ) {
            (measurementUnitNode[0] as Node).appendChild(measurementUnitText);
        } else {
            throw new Error('Could not find valid <cf:MeasurementUnit> node in the configuration XML.');
        }
      }

      //add the language
      let languageNode = select("//cf:Language", xml);
      if (
          !Array.isArray(languageNode) ||
          languageNode.length === 0
      ) {
        this.debugMessages.push("The configuration file does not contain a node for the language. The default will be used.");
      } else {
        let languageText = xml.createTextNode(this.language!);
        if (
            xml.defaultView !== null
        ) {
            (languageNode[0] as Node).appendChild(languageText);
        } else {
            throw new Error('Could not find valid <cf:Language> node in the configuration XML.');
        }
      }

      //save the modified config file to the output folder
      this.debugMessages.push("Saving the final configuration file " + this.finalConfigFilePath);
      fs.writeFileSync(this.finalConfigFilePath, xml.toString());
    } catch (error) {
      throw error;
    }
  };

  /**
   * Creates an XML string of a basic configuration file for PitStop Server
   */
  private createBasicConfigFile = () => {
    this.debugMessages.push("Creating a basic configuration file");
    let xmlString: string = `<?xml version="1.0" encoding="utf-8"?>
        <cf:Configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:cf="http://www.enfocus.com/PitStop/24/PitStopServerCLI_Configuration.xsd">
        <cf:Versioning>
        <cf:Version>11</cf:Version>
        <cf:VersioningStrategy>MustHonor</cf:VersioningStrategy>
        </cf:Versioning>
        <cf:Initialize>
        <cf:ProcessingMethod>EnforceServer</cf:ProcessingMethod>
        <cf:ShutDownServerAtExit>false</cf:ShutDownServerAtExit>
        </cf:Initialize>
        <cf:TaskReport>
        <cf:LogProcessResults>true</cf:LogProcessResults>
        <cf:LogErrors>true</cf:LogErrors>
        </cf:TaskReport>
        <cf:Process>
        <cf:InputPDF>
        <cf:InputPath></cf:InputPath>
        </cf:InputPDF>
        <cf:OutputPDF>
        <cf:OutputPath></cf:OutputPath>
        </cf:OutputPDF>
        <cf:Mutators>
        </cf:Mutators>
        <cf:Reports>
        </cf:Reports>
        <cf:MeasurementUnit></cf:MeasurementUnit>
        <cf:Language></cf:Language>
        </cf:Process>
        </cf:Configuration>`;
    try {
      this.debugMessages.push("Saving basic configuration file " + this.finalConfigFilePath);
      fs.writeFileSync(this.finalConfigFilePath, xmlString);
    } catch (error) {
      throw error;
    }
  };

  //////////////////////////////////////////////////////////////////////////
  //
  // PitStopServer static API methods
  //
  //////////////////////////////////////////////////////////////////////////

  /**
   * Static helper method to execute commands using Node.js native exec
   * @param command - The command to execute
   * @param args - Array of arguments
   * @returns Promise with execution result
   */
  private static executeCommand = async (command: string, args: string[]): Promise<Record<string, any>> => {
    const execAsync = promisify(exec);
    const fullCommand = `"${command}" ${args.join(' ')}`;
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      return {
        command: fullCommand,
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error: any) {
      return {
        command: fullCommand,
        exitCode: error.code || -1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message
      };
    }
  };
  /**
   * Static method returning the version number of PitStop Server
   * @returns string
   */
  public static getVersion = async () => {
    //get the application path of PitStop Server
    if (PitStopServer.applicationPath == undefined) {
      try {
        PitStopServer.getApplicationPath();
      } catch (error) {
        throw error;
      }
    }
    let execResult;
    try {
      execResult = await PitStopServer.executeCommand(PitStopServer.applicationPath, ["-version"]);
      return execResult.stdout;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Static function to get the path of the CLI application of PitStop Server
   * @returns string
   */
  public static getApplicationPath = () => {
    if (PitStopServer.applicationPath !== undefined) {
      return PitStopServer.applicationPath;
    }
    if (os.platform().startsWith("win") == true) {
      //access the registry to find the path to PitStop Server
      try {
        PitStopServer.applicationPath = PitStopServer.findPitStopServerInRegistry();
      } catch (error) {
        throw error;
      }
      return PitStopServer.applicationPath;
    } else {
      //locate PitStop Server in the OSX Applications folder; the name of this folder is only localized in the Finder so it is /Applications regardless of the system language
      let enfocusDir = "/Applications/Enfocus";
      let psPath = "";
      try {
        let enfocusList = fs.readdirSync(enfocusDir);
        for (let i = 0; i < enfocusList.length; i++) {
          if (enfocusList[i].startsWith("Enfocus PitStop Server") == true) {
            psPath = enfocusDir + "/" + enfocusList[i];
          }
        }
        if (psPath == "") {
          throw new Error("Could not find the Enfocus PitStopServerCLI symbolic link in " + enfocusDir);
        }
      } catch (error) {
        throw error;
      }
      try {
        PitStopServer.applicationPath = fs.realpathSync(psPath + "/PitStopServerCLI");
      } catch (error) {
        throw error;
      }
    }
    return PitStopServer.applicationPath;
  };

  /**
   * Private static method to find the path to the PitStop Server CLI application in the Windows registry
   * @returns string
   */
  private static findPitStopServerInRegistry = () => {
    try {
      const registryKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\PitStop Server.exe';
      const command = `reg query "${registryKey}" /v Path`;
      
      const output = execSync(command, { encoding: 'utf8' });
      
      // Parse the registry output to find the Path value
      const lines = output.split('\r\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('Path') && trimmedLine.includes('REG_SZ')) {
          // Extract the path value (format: "Path    REG_SZ    C:\Path\To\Application")
          const parts = trimmedLine.split('REG_SZ');
          if (parts.length > 1) {
            const applicationPath = parts[1].trim();
            if (applicationPath === '') {
              throw new Error('No path value found for PitStop Server.exe in the registry');
            }
            return applicationPath + '\\PitStopServerCLI.exe';
          }
        }
      }
      
      throw new Error('No key found with the name Path under PitStop Server.exe in the registry');
    } catch (error) {
      if (error instanceof Error && error.message.includes('registry')) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error('Failed to query Windows registry for PitStop Server path: ' + errorMessage);
    }
  };
}
